/**
 * The seed maps (SPEC §7.4, licence: Natural Earth, public domain) are equirectangular: x
 * follows longitude, y latitude, with longitudes shortened by cos(lat0) so the map keeps its
 * proportions around lat0. The same projection draws the SVG (scripts/build-seed-maps.ts) and
 * places the targets, so a target is exactly where the place is on the image.
 */
export interface SeedMap {
  /** File name of the SVG next to this module. */
  file: string;
  west: number;
  east: number;
  south: number;
  north: number;
  /** Latitude whose proportions are kept. */
  lat0: number;
  width: number;
}

export const TURKIYE_MAP: SeedMap = {
  file: 'turkiye.svg',
  west: 25.4,
  east: 45.2,
  south: 35.6,
  north: 42.4,
  lat0: 39,
  width: 2000,
};

export const WORLD_MAP: SeedMap = {
  file: 'dunya.svg',
  west: -180,
  east: 180,
  south: -58,
  north: 84,
  lat0: 0,
  width: 2000,
};

export function mapHeight(map: SeedMap): number {
  const lonSpan = (map.east - map.west) * Math.cos((map.lat0 * Math.PI) / 180);
  return Math.round((map.width * (map.north - map.south)) / lonSpan);
}

/** A place on the map as an image point (0..1 across width and height). */
export function project(map: SeedMap, lat: number, lon: number): { x: number; y: number } {
  return {
    x: (lon - map.west) / (map.east - map.west),
    y: (map.north - lat) / (map.north - map.south),
  };
}
