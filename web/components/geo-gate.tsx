"use client";

import { useState } from "react";
import { clsx } from "clsx";
import * as Dialog from "@radix-ui/react-dialog";
import type { GeoFence, GeoFenceMode, GeoCoordinates } from "@/lib/types";
import {
  isInsideGeoFence,
  getDistanceToFence,
  formatDistance,
  describeGeoFence,
} from "@/lib/geo";
import type { UseGeolocationResult } from "@/hooks/use-geolocation";

interface GeoGateProps {
  geoFence: GeoFence;
  geoFenceMode: GeoFenceMode;
  bonusMultiplier?: number;
  geolocation: UseGeolocationResult;
  onLocationObtained?: (location: GeoCoordinates, inZone: boolean) => void;
}

/**
 * Location permission UI component for geo-fenced drops
 * Shows geo-fence requirements and handles permission flow
 */
export function GeoGate({
  geoFence,
  geoFenceMode,
  bonusMultiplier = 1.5,
  geolocation,
  onLocationObtained,
}: GeoGateProps) {
  const [showHelp, setShowHelp] = useState(false);

  const { location, error, loading, permissionState, requestLocation } =
    geolocation;

  const isExclusive = geoFenceMode === "exclusive";
  const isInZone = location ? isInsideGeoFence(location, geoFence) : false;
  const distanceToZone = location ? getDistanceToFence(location, geoFence) : 0;

  const handleRequestLocation = async () => {
    const coords = await requestLocation();
    if (coords) {
      const inZone = isInsideGeoFence(coords, geoFence);
      onLocationObtained?.(coords, inZone);
    }
  };

  // Already have location and in zone - show success state
  if (location && isInZone) {
    return (
      <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-emerald-400">
              {isExclusive ? "Location Verified" : `${bonusMultiplier}x Geo Bonus Active`}
            </p>
            <p className="text-xs text-foreground-muted">
              {geoFence.name || describeGeoFence(geoFence)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Have location but outside zone
  if (location && !isInZone) {
    return (
      <div
        className={clsx(
          "p-4 rounded-xl border",
          isExclusive
            ? "bg-rose-500/10 border-rose-500/30"
            : "bg-amber-500/10 border-amber-500/30"
        )}
      >
        <div className="flex items-center gap-3">
          <div
            className={clsx(
              "w-10 h-10 rounded-xl flex items-center justify-center",
              isExclusive ? "bg-rose-500/20" : "bg-amber-500/20"
            )}
          >
            <svg
              className={clsx(
                "w-5 h-5",
                isExclusive ? "text-rose-400" : "text-amber-400"
              )}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <p
              className={clsx(
                "text-sm font-medium",
                isExclusive ? "text-rose-400" : "text-amber-400"
              )}
            >
              {isExclusive
                ? "Outside Drop Zone"
                : "Outside Bonus Zone"}
            </p>
            <p className="text-xs text-foreground-muted">
              {formatDistance(distanceToZone)} away from{" "}
              {geoFence.name || "drop zone"}
            </p>
          </div>
        </div>
        {isExclusive && (
          <p className="text-xs text-rose-300/70 mt-3">
            You must be within the drop zone to register for this exclusive drop.
          </p>
        )}
        {!isExclusive && (
          <p className="text-xs text-amber-300/70 mt-3">
            You can still register, but you won&apos;t receive the {bonusMultiplier}x location bonus.
          </p>
        )}
      </div>
    );
  }

  // Permission denied
  if (permissionState === "denied" || error?.code === 1) {
    return (
      <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/20 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-rose-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-rose-400">
              Location Access Denied
            </p>
            <p className="text-xs text-foreground-muted">
              {isExclusive
                ? "Required for this drop"
                : "Enable for geo bonus"}
            </p>
          </div>
        </div>
        <p className="text-xs text-foreground-secondary mb-3">
          To enable location access:
        </p>
        <ol className="text-xs text-foreground-muted space-y-1 list-decimal list-inside">
          <li>Click the lock/info icon in your browser&apos;s address bar</li>
          <li>Find &quot;Location&quot; in the permissions list</li>
          <li>Change it to &quot;Allow&quot;</li>
          <li>Refresh this page</li>
        </ol>
      </div>
    );
  }

  // Default: prompt for location
  return (
    <div className="p-4 rounded-xl bg-accent/10 border border-accent/30">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
          <svg
            className="w-5 h-5 text-accent"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-accent">
            {isExclusive ? "Location Required" : "Location Bonus Available"}
          </p>
          <p className="text-xs text-foreground-muted">
            {geoFence.name || describeGeoFence(geoFence)}
          </p>
        </div>
      </div>

      <p className="text-xs text-foreground-secondary mb-4">
        {isExclusive
          ? "This is an exclusive geo-fenced drop. You must be within the drop zone to register."
          : `Get a ${bonusMultiplier}x ticket multiplier by registering from within the drop zone!`}
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleRequestLocation}
          disabled={loading}
          className={clsx(
            "flex-1 py-2.5 px-4 rounded-lg font-medium text-sm",
            "bg-accent text-background hover:bg-accent/90",
            "transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
            "flex items-center justify-center gap-2"
          )}
        >
          {loading ? (
            <>
              <svg
                className="w-4 h-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Getting Location...
            </>
          ) : (
            <>
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
              </svg>
              Share Location
            </>
          )}
        </button>

        <Dialog.Root open={showHelp} onOpenChange={setShowHelp}>
          <Dialog.Trigger asChild>
            <button
              type="button"
              className="p-2.5 rounded-lg bg-foreground/10 hover:bg-foreground/20 transition-colors"
              aria-label="Learn more"
            >
              <svg
                className="w-4 h-4 text-foreground-secondary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </button>
          </Dialog.Trigger>

          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
            <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md border border-border rounded-2xl p-5 shadow-2xl bg-[#171717] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                    <svg
                      className="w-5 h-5 text-accent"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                      />
                    </svg>
                  </div>
                  <Dialog.Title className="text-lg font-semibold text-foreground">
                    Geo-Fenced Drop
                  </Dialog.Title>
                </div>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="text-foreground-muted hover:text-foreground p-1 rounded-lg hover:bg-foreground/5 transition-colors"
                    aria-label="Close"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </Dialog.Close>
              </div>

              <Dialog.Description asChild>
                <div className="space-y-4">
                  <p className="text-sm text-foreground-secondary">
                    This drop uses location verification to{" "}
                    {isExclusive
                      ? "ensure only people at the drop location can participate."
                      : "reward participants who are at the drop location."}
                  </p>

                  <div className="p-3 rounded-lg bg-background border border-border">
                    <p className="text-xs text-foreground-muted mb-2">
                      Drop Zone
                    </p>
                    <p className="text-sm font-medium text-foreground">
                      {geoFence.name || describeGeoFence(geoFence)}
                    </p>
                  </div>

                  {isExclusive ? (
                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
                      <p className="text-xs text-rose-400 font-medium mb-1">
                        Exclusive Drop
                      </p>
                      <p className="text-xs text-foreground-secondary">
                        You must be physically present within the drop zone to
                        register. This creates a fair experience for everyone
                        at the location.
                      </p>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <p className="text-xs text-emerald-400 font-medium mb-1">
                        Bonus Mode
                      </p>
                      <p className="text-xs text-foreground-secondary">
                        Anyone can register, but participants at the drop
                        location get a {bonusMultiplier}x ticket multiplier,
                        increasing their chances of winning.
                      </p>
                    </div>
                  )}

                  <p className="text-[10px] text-foreground-muted text-center">
                    Your location is only used to verify eligibility and is not
                    stored.
                  </p>
                </div>
              </Dialog.Description>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>

      {error && error.code !== 1 && (
        <p className="text-xs text-rose-400 mt-2">{error.message}</p>
      )}
    </div>
  );
}

