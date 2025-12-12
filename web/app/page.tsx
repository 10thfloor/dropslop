"use client";

import { useEffect, useMemo, useState } from "react";
import { DropCard, type DropListItem } from "@/components/drop-card";
import { getUserStatus } from "@/lib/api";
import type { UserState } from "@/lib/types";
import { getOrCreateUserId } from "@/hooks/use-user-id";

type DropsEventPayload = {
  drops: DropListItem[];
  serverTime: number;
};

export default function HomePage() {
  const [drops, setDrops] = useState<DropListItem[]>([]);
  const [clockOffset, setClockOffset] = useState(0);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userStatusByDropId, setUserStatusByDropId] = useState<
    Record<string, UserState | undefined>
  >({});

  useEffect(() => {
    // Connect directly to SSE server (Next.js dev server doesn't reliably proxy SSE streams)
    const sseBaseUrl =
      process.env.NEXT_PUBLIC_SSE_URL || "http://localhost:3004";
    const es = new EventSource(`${sseBaseUrl}/events/drops`);

    es.addEventListener("open", () => {
      setConnected(true);
      setError(null);
    });

    es.addEventListener("drops", (e) => {
      try {
        const payload = JSON.parse(
          (e as MessageEvent).data
        ) as DropsEventPayload;
        setDrops(payload.drops ?? []);
        setClockOffset(payload.serverTime - Date.now());
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
    if (!connected) return "Connecting…";
    return "Live updates enabled";
  }, [connected]);

  return (
    <main className="min-h-screen bg-background px-6 pt-16 pb-16">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Active Drops</h1>
          <p className="text-sm text-foreground-secondary">{subtitle}</p>
          {error && <p className="text-sm text-rose-400">{error}</p>}
        </header>

        {!hasDrops ? (
          <div className="rounded-2xl border border-border p-6 text-foreground-secondary">
            No active drops right now. Run{" "}
            <code className="font-mono text-foreground">make init-drop</code> to
            create one.
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
  );
}
