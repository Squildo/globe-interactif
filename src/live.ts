import type { Atlas, Region } from './atlas';
import type { Feed } from './models';
import type { science } from './science';

export type FeedLoader = (signal: AbortSignal) => Promise<Feed>;
const apiFeed = (url: string): FeedLoader => async signal => {
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(16_000)]) });
  if (!response.ok) throw Error('Flux indisponible');
  return response.json();
};

// Un cache par onglet, partagé entre les activations ; le premier flux charge le module SGP4.
let feeds: Promise<ReturnType<typeof science>> | undefined;
const publicFeeds = () => feeds ??= import('./science').then(({ science }) => science(
  (input, options) => fetch(input, { ...options, credentials: 'omit', referrerPolicy: 'no-referrer' }), Date.now,
));

type Loaders = {
  quakes: (period: Atlas['period']) => FeedLoader;
  events: FeedLoader;
  satellites: FeedLoader;
  air: (region: Region) => FeedLoader | undefined;
  sea: FeedLoader | undefined;
};
export const live: Loaders = import.meta.env.MODE === 'pages' ? {
  quakes: period => async () => (await publicFeeds()).quakes[period](),
  events: async () => (await publicFeeds()).events(),
  satellites: async () => (await publicFeeds()).satellites(),
  air: () => undefined, sea: undefined,
} : {
  quakes: period => apiFeed(`/api/earthquakes?period=${period}`),
  events: apiFeed('/api/events'), satellites: apiFeed('/api/satellites'),
  air: region => apiFeed(`/api/air-traffic?region=${region}`), sea: apiFeed('/api/sea-traffic'),
};
