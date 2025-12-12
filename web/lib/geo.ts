/**
 * Client-side geo utilities
 * Mirrors backend geo.ts for consistent behavior
 */

import type { GeoCoordinates, GeoFence } from "./types";

// Earth's radius in meters
const EARTH_RADIUS_METERS = 6371000;

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate the Haversine distance between two coordinates
 * Returns distance in meters
 */
export function haversineDistance(
  p1: GeoCoordinates,
  p2: GeoCoordinates
): number {
  const lat1 = toRadians(p1.lat);
  const lat2 = toRadians(p2.lat);
  const deltaLat = toRadians(p2.lat - p1.lat);
  const deltaLng = toRadians(p2.lng - p1.lng);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Check if a point is inside a polygon using ray casting algorithm
 */
export function pointInPolygon(
  point: GeoCoordinates,
  polygon: GeoCoordinates[]
): boolean {
  if (polygon.length < 3) {
    return false;
  }

  let inside = false;
  const x = point.lng;
  const y = point.lat;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Check if a location is inside a geo-fence
 */
export function isInsideGeoFence(
  location: GeoCoordinates,
  fence: GeoFence
): boolean {
  if (fence.type === "radius") {
    const distance = haversineDistance(location, fence.center);
    return distance <= fence.radiusMeters;
  }

  if (fence.type === "polygon") {
    return pointInPolygon(location, fence.vertices);
  }

  return false;
}

/**
 * Get the distance from a location to a geo-fence
 * Returns 0 if inside, positive meters if outside
 */
export function getDistanceToFence(
  location: GeoCoordinates,
  fence: GeoFence
): number {
  if (fence.type === "radius") {
    const distance = haversineDistance(location, fence.center);
    return Math.max(0, distance - fence.radiusMeters);
  }

  if (fence.type === "polygon") {
    if (pointInPolygon(location, fence.vertices)) {
      return 0;
    }

    // Find minimum distance to any vertex
    let minDistance = Infinity;
    for (const v of fence.vertices) {
      const distance = haversineDistance(location, v);
      minDistance = Math.min(minDistance, distance);
    }
    return minDistance;
  }

  return Infinity;
}

/**
 * Format a distance in meters to a human-readable string
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

/**
 * Get the center point of a geo-fence
 */
export function getGeoFenceCenter(fence: GeoFence): GeoCoordinates {
  if (fence.type === "radius") {
    return fence.center;
  }

  if (fence.type === "polygon") {
    let sumLat = 0;
    let sumLng = 0;
    for (const v of fence.vertices) {
      sumLat += v.lat;
      sumLng += v.lng;
    }
    return {
      lat: sumLat / fence.vertices.length,
      lng: sumLng / fence.vertices.length,
    };
  }

  return { lat: 0, lng: 0 };
}

/**
 * Get a human-readable description of a geo-fence
 */
export function describeGeoFence(fence: GeoFence): string {
  const name = fence.name ? `${fence.name}: ` : "";

  if (fence.type === "radius") {
    return `${name}Within ${formatDistance(fence.radiusMeters)}`;
  }

  if (fence.type === "polygon") {
    return `${name}Within designated area`;
  }

  return "Unknown area";
}

