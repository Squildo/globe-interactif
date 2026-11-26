import json
import os
import time
import urllib.request

os.makedirs('live', exist_ok=True)
UA = {'User-Agent': 'terrascope-live-data/1.0 (github-actions; contact: repo owner)'}


def get(url, timeout=10):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8', 'replace'))


PLANE_CENTERS = [
    (50.0, 8.0), (51.5, -0.5), (40.64, -73.78), (39.0, -98.0), (33.94, -118.41),
    (45.0, -40.0), (35.55, 139.78), (31.2, 121.5), (1.36, 103.99), (25.25, 55.36),
    (-23.55, -46.63), (-33.87, 151.21), (19.08, 72.88), (52.31, 13.4), (37.62, -122.38),
    (28.5, 77.1), (-34.6, -58.4), (55.0, 37.6), (60.2, 24.9),
]

AIS_URL = ('https://ais.openwaters.io/v1/vessels?kind=vessel&max_age=30m'
           '&bbox=1,100,4,104&bbox=29,31,31.5,34&bbox=35,-7,37,-3&bbox=8,-80,10,-78'
           '&bbox=50,0,53,3&bbox=40.8,28.5,41.3,29.5&bbox=25.5,55,27.5,58'
           '&bbox=32,-80,36,-74&bbox=10,110,14,114&bbox=30,120,32,123')

KEEP = ('hex', 'flight', 'r', 't', 'lat', 'lon', 'alt_baro', 'gs', 'track', 'seen_pos', 'category')


def fetch_planes():
    seen = set()
    ac = []
    for lat, lon in PLANE_CENTERS:
        try:
            j = get('https://api.adsb.lol/v2/lat/{}/lon/{}/dist/250'.format(lat, lon))
            for a in (j.get('ac') or []):
                h = str(a.get('hex') or '').lower()
                if not h or h in seen:
                    continue
                if a.get('lat') is None or a.get('lon') is None or a.get('alt_baro') == 'ground':
                    continue
                seen.add(h)
                ac.append({k: a.get(k) for k in KEEP if a.get(k) is not None})
                if len(ac) >= 800:
                    break
            time.sleep(0.2)
        except Exception as e:
            print('plane query failed', lat, lon, repr(e))
        if len(ac) >= 800:
            break
    if len(ac) >= 5:
        payload = {'ts': int(time.time()), 'src': 'adsb.lol', 'count': len(ac), 'ac': ac}
        with open('live/planes.json', 'w') as f:
            json.dump(payload, f, separators=(',', ':'))
        print('planes.json written:', len(ac))
    else:
        print('planes: not enough data, keeping previous file')


def fetch_ships():
    try:
        j = get(AIS_URL, 15)
    except Exception as e:
        print('ais query failed', repr(e))
        return
    feats = []
    seen = set()
    for f in (j.get('features') or []):
        c = ((f.get('geometry') or {}).get('coordinates')) or []
        p = f.get('properties') or {}
        if len(c) < 2:
            continue
        try:
            lon = float(c[0])
            lat = float(c[1])
        except (TypeError, ValueError):
            continue
        if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
            continue
        m = p.get('mmsi')
        if m is not None:
            if m in seen:
                continue
            seen.add(m)
        feats.append({
            'geometry': {'coordinates': [lon, lat]},
            'properties': {k: p.get(k) for k in ('mmsi', 'name', 'sog', 'cog', 'shiptype') if p.get(k) is not None},
        })
        if len(feats) >= 400:
            break
    if len(feats) >= 3:
        payload = {'ts': int(time.time()), 'src': 'ais.openwaters.io', 'count': len(feats), 'features': feats}
        with open('live/ships.json', 'w') as f:
            json.dump(payload, f, separators=(',', ':'))
        print('ships.json written:', len(feats))
    else:
        print('ships: not enough data, keeping previous file')


if __name__ == '__main__':
    fetch_planes()
    fetch_ships()
