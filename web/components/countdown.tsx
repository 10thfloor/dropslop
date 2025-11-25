"use client";

import { clsx } from "clsx";

interface CountdownProps {
  hours: number;
  minutes: number;
  seconds: number;
  label: string;
  expired?: boolean;
}

function TimeUnit({
  value,
  separator = true,
  expired = false,
}: {
  value: number;
  separator?: boolean;
  expired?: boolean;
}) {
  return (
    <>
      <span
        className={clsx(
          "font-mono text-5xl md:text-7xl font-medium tabular-nums transition-colors",
          expired ? "text-foreground-muted" : "text-foreground"
        )}
      >
        {value.toString().padStart(2, "0")}
      </span>
      {separator && (
        <span
          className={clsx(
            "font-mono text-5xl md:text-7xl font-light mx-1 transition-colors",
            expired ? "text-foreground-muted/50" : "text-foreground-muted"
          )}
        >
          :
        </span>
      )}
    </>
  );
}

export function Countdown({
  hours,
  minutes,
  seconds,
  label,
  expired = false,
}: CountdownProps) {
  return (
    <div className="text-center space-y-4">
      {label && (
        <p
          className={clsx(
            "text-sm uppercase tracking-[0.2em] transition-colors",
            expired ? "text-foreground-muted" : "text-foreground-secondary"
          )}
        >
          {label}
        </p>
      )}
      <div className="flex justify-center items-center">
        <TimeUnit value={hours} expired={expired} />
        <TimeUnit value={minutes} expired={expired} />
        <TimeUnit value={seconds} separator={false} expired={expired} />
      </div>
    </div>
  );
}
