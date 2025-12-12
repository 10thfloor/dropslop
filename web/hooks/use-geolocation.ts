"use client";

import { useState, useCallback, useEffect } from "react";

export interface GeoCoordinates {
  lat: number;
  lng: number;
}

export type PermissionState = "prompt" | "granted" | "denied" | null;

export interface GeolocationError {
  code: number;
  message: string;
}

export interface UseGeolocationResult {
  /** Current user location, null if not yet obtained */
  location: GeoCoordinates | null;
  /** Error if location request failed */
  error: GeolocationError | null;
  /** True while actively requesting location */
  loading: boolean;
  /** Current permission state */
  permissionState: PermissionState;
  /** Request location from user */
  requestLocation: () => Promise<GeoCoordinates | null>;
  /** Clear current location and error */
  reset: () => void;
}

/**
 * Hook for managing browser geolocation
 * Handles permission state, loading, and errors
 */
export function useGeolocation(): UseGeolocationResult {
  const [location, setLocation] = useState<GeoCoordinates | null>(null);
  const [error, setError] = useState<GeolocationError | null>(null);
  const [loading, setLoading] = useState(false);
  const [permissionState, setPermissionState] = useState<PermissionState>(null);

  // Check initial permission state
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions) {
      return;
    }

    navigator.permissions
      .query({ name: "geolocation" })
      .then((result) => {
        setPermissionState(result.state as PermissionState);

        // Listen for permission changes
        result.addEventListener("change", () => {
          setPermissionState(result.state as PermissionState);
        });
      })
      .catch(() => {
        // Permissions API not supported, will discover on request
        setPermissionState(null);
      });
  }, []);

  const requestLocation = useCallback(async (): Promise<GeoCoordinates | null> => {
    // Check if geolocation is supported
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      const err: GeolocationError = {
        code: 0,
        message: "Geolocation is not supported by this browser",
      };
      setError(err);
      return null;
    }

    setLoading(true);
    setError(null);

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords: GeoCoordinates = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setLocation(coords);
          setError(null);
          setLoading(false);
          setPermissionState("granted");
          resolve(coords);
        },
        (geoError) => {
          const err: GeolocationError = {
            code: geoError.code,
            message: getErrorMessage(geoError.code),
          };
          setError(err);
          setLoading(false);

          // Update permission state based on error
          if (geoError.code === 1) {
            // PERMISSION_DENIED
            setPermissionState("denied");
          }

          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000, // Cache for 1 minute
        }
      );
    });
  }, []);

  const reset = useCallback(() => {
    setLocation(null);
    setError(null);
    setLoading(false);
  }, []);

  return {
    location,
    error,
    loading,
    permissionState,
    requestLocation,
    reset,
  };
}

/**
 * Get human-readable error message for geolocation error codes
 */
function getErrorMessage(code: number): string {
  switch (code) {
    case 1: // PERMISSION_DENIED
      return "Location permission denied. Please enable location access in your browser settings.";
    case 2: // POSITION_UNAVAILABLE
      return "Location unavailable. Please check your device's location services.";
    case 3: // TIMEOUT
      return "Location request timed out. Please try again.";
    default:
      return "Failed to get location. Please try again.";
  }
}

