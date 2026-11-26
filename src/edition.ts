import type { Style } from './atlas';

export const isPages = import.meta.env.MODE === 'pages';
export const isStyleAvailable = (style: Style) => !isPages || style !== 'relief';
