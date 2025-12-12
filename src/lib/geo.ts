/**
 * Geo-fence utilities for location-based drop restrictions
 * Pure functions for distance calculations and boundary checks
 */

import type { GeoCoordinates, GeoFence } from "./types.js";

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
 *
 * @see https://en.wikipedia.org/wiki/Haversine_formula
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
 * Works for any simple polygon (convex or concave)
 *
 * @see https://en.wikipedia.org/wiki/Point_in_polygon
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

    // Check if the ray from point crosses this edge
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
 * Supports both radius and polygon fence types
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

  // Unknown fence type
  return false;
}

/**
 * Get the distance from a location to the nearest point of a geo-fence
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

    // Find minimum distance to any edge
    let minDistance = Infinity;
    for (let i = 0; i < fence.vertices.length; i++) {
      const distance = haversineDistance(location, fence.vertices[i]);
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
 * Validate a geo-fence configuration
 * Returns an error message if invalid, null if valid
 */
export function validateGeoFence(
  fence: GeoFence,
  minRadius: number,
  maxRadius: number
): string | null {
  if (fence.type === "radius") {
    if (
      typeof fence.center?.lat !== "number" ||
      typeof fence.center?.lng !== "number"
    ) {
      return "Radius fence requires valid center coordinates";
    }
    if (fence.center.lat < -90 || fence.center.lat > 90) {
      return "Latitude must be between -90 and 90";
    }
    if (fence.center.lng < -180 || fence.center.lng > 180) {
      return "Longitude must be between -180 and 180";
    }
    if (typeof fence.radiusMeters !== "number" || fence.radiusMeters <= 0) {
      return "Radius must be a positive number";
    }
    if (fence.radiusMeters < minRadius) {
      return `Radius must be at least ${formatDistance(minRadius)}`;
    }
    if (fence.radiusMeters > maxRadius) {
      return `Radius must be at most ${formatDistance(maxRadius)}`;
    }
    return null;
  }

  if (fence.type === "polygon") {
    if (!Array.isArray(fence.vertices) || fence.vertices.length < 3) {
      return "Polygon fence requires at least 3 vertices";
    }
    for (let i = 0; i < fence.vertices.length; i++) {
      const v = fence.vertices[i];
      if (typeof v?.lat !== "number" || typeof v?.lng !== "number") {
        return `Invalid vertex at index ${i}`;
      }
      if (v.lat < -90 || v.lat > 90) {
        return `Vertex ${i}: latitude must be between -90 and 90`;
      }
      if (v.lng < -180 || v.lng > 180) {
        return `Vertex ${i}: longitude must be between -180 and 180`;
      }
    }
    return null;
  }

  return "Unknown geo-fence type";
}

/**
 * Get the center point of a geo-fence (for display purposes)
 */
export function getGeoFenceCenter(fence: GeoFence): GeoCoordinates {
  if (fence.type === "radius") {
    return fence.center;
  }

  if (fence.type === "polygon") {
    // Calculate centroid of polygon
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
    return `${name}Within ${formatDistance(fence.radiusMeters)} of location`;
  }

  if (fence.type === "polygon") {
    return `${name}Within designated area`;
  }

  return "Unknown area";
}

