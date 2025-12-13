"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DropCard,
  DropCardSkeleton,
  type DropListItem,
} from "@/components/drop-card";
import { Header } from "@/components/header";
import { getUserStatus } from "@/lib/api";
import type { UserState } from "@/lib/types";
import { getOrCreateUserId } from "@/hooks/use-user-id";
import { getSseBaseUrl } from "@/lib/sse-base";

type DropsEventPayload = {
  drops: DropListItem[];
  serverTime: number;
};

export default function HomePage() {
  const [drops, setDrops] = useState<DropListItem[]>([]);
  const [clockOffset, setClockOffset] = useState(0);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const [lastServerTime, setLastServerTime] = useState<number | null>(null);
  const [userStatusByDropId, setUserStatusByDropId] = useState<
    Record<string, UserState | undefined>
  >({});

  useEffect(() => {
    const base = getSseBaseUrl();
    const url = base ? `${base}/events/drops` : "/events/drops";
    const es = new EventSource(url);

    es.addEventListener("open", () => {
      setConnected(true);
      setError(null);
    });

    es.addEventListener("drops", (e) => {
      try {
        const payload = JSON.parse(
          (e as MessageEvent).data
        ) as DropsEventPayload;
        const list = (payload.drops ?? []).slice().sort((a, b) => {
          const aTarget =
            a.phase === "purchase" && a.purchaseEnd
              ? a.purchaseEnd
              : a.registrationEnd;
          const bTarget =
            b.phase === "purchase" && b.purchaseEnd
              ? b.purchaseEnd
              : b.registrationEnd;
          return aTarget - bTarget;
        });
        setDrops(list);
        setClockOffset(payload.serverTime - Date.now());
        setHasSnapshot(true);
        setLastServerTime(payload.serverTime);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to parse SSE payload"
        );
      }
    });

    es.addEventListener("error", () => {
      setConnected(false);
      setError("Disconnected from live updates (will retry)");
      // Browser EventSource auto-reconnects.
    });

    return () => es.close();
  }, []);

  // Fetch per-drop user status so the homepage can indicate "Registered"
  // without needing real auth yet.
  useEffect(() => {
    if (!drops.length) return;

    let cancelled = false;

    const dropIds = drops.map((d) => d.dropId);
    const missing = dropIds.filter((id) => !userStatusByDropId[id]);
    if (!missing.length) return;

    (async () => {
      const results = await Promise.allSettled(
        missing.map(async (dropId) => {
          const userId = getOrCreateUserId(dropId);
          const state = await getUserStatus(dropId, userId);
          return { dropId, state };
        })
      );

      if (cancelled) return;

      setUserStatusByDropId((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (r.status === "fulfilled") {
            next[r.value.dropId] = r.value.state;
          }
        }
        return next;
      });
    })().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [drops, userStatusByDropId]);

  const hasDrops = drops.length > 0;

  const subtitle = useMemo(() => {
    if (!hasSnapshot) return "Loading live drops…";
    if (!connected) return "Reconnecting…";
    return "Live updates enabled";
  }, [connected, hasSnapshot]);

  const lastUpdatedLabel = useMemo(() => {
    if (!lastServerTime) return null;
    const deltaMs = Date.now() - (lastServerTime - clockOffset);
    const s = Math.max(0, Math.round(deltaMs / 1000));
    if (s < 5) return "Updated just now";
    if (s < 60) return `Updated ${s}s ago`;
    const m = Math.round(s / 60);
    return `Updated ${m}m ago`;
  }, [lastServerTime, clockOffset]);

  return (
    <div className="min-h-screen bg-background">
      <Header connected={connected} brand="DROP" />
      <main className="pt-24 pb-12 px-6">
        <div className="max-w-2xl mx-auto space-y-8">
          <header className="space-y-2">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h1 className="text-3xl font-bold tracking-tight">
                  Active Drops
                </h1>
                <p className="text-sm text-foreground-secondary">{subtitle}</p>
                {lastUpdatedLabel && (
                  <p className="text-xs text-foreground-muted">
                    {lastUpdatedLabel}
                  </p>
                )}
                {error && <p className="text-sm text-rose-400">{error}</p>}
              </div>
            </div>
          </header>

          {!hasSnapshot ? (
            <div className="space-y-3">
              <DropCardSkeleton />
              <DropCardSkeleton />
              <DropCardSkeleton />
            </div>
          ) : !hasDrops ? (
            <div className="rounded-2xl border border-border p-6 text-foreground-secondary">
              <div className="text-sm">No active drops right now.</div>
              <div className="mt-2 text-xs text-foreground-muted">
                Check back soon for the next release.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {drops.map((d) => (
                <DropCard
                  key={d.dropId}
                  drop={d}
                  clockOffset={clockOffset}
                  userStatus={userStatusByDropId[d.dropId]?.status}
                  userTickets={userStatusByDropId[d.dropId]?.tickets}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
