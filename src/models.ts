export type Position = { lat: number; lng: number };
export type Mark = Position & {
  id: string; name: string; subtitle?: string; number?: number; observedAt?: number;
  depth?: number; altitude?: number; code?: string; color?: string; radius?: number; band?: 'low' | 'medium' | 'high';
};
export type Area = {
  id: string; name: string; nativeName: string;
  geometry: { type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] };
  population?: number; gdp?: number; populationYear?: number; gdpYear?: number; center: Position;
};
export type Route = {
  id: string; name: string; startLat: number; startLng: number; endLat: number; endLng: number; weight: number;
};
export type FeedState = 'fresh' | 'stale' | 'loading' | 'disabled' | 'unavailable' | 'limited';
export type Feed<T = Mark> = { status: FeedState; items: T[]; updatedAt: number | null; note?: string };
export type Place = Position & { id: string; name: string; context: string; aliases?: string[]; altitude?: number };
export type Details = { title: string; subtitle: string; facts: [string, string][]; source: string; url: string };

export const isPosition = (lat: unknown, lng: unknown) => typeof lat === 'number' && lat >= -90 && lat <= 90 && typeof lng === 'number' && lng >= -180 && lng <= 180;
