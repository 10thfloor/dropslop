"use client";

import { clsx } from "clsx";

export type ActionStep =
  | "idle"
  | "challenge"
  | "solving"
  | "registering"
  | "processing"
  | "success"
  | "error";

interface ActionStatusProps {
  step: ActionStep;
  progress?: number;
  message?: string;
  position?: number;
}

const stepConfig: Record<
  ActionStep,
  {
    label: string;
    icon: "spinner" | "check" | "error" | "shield" | "cpu" | "send" | "idle";
    color: string;
  }
> = {
  idle: {
    label: "",
    icon: "idle",
    color: "text-foreground-muted",
  },
  challenge: {
    label: "GETTING CHALLENGE",
    icon: "shield",
    color: "text-foreground-secondary",
  },
  solving: {
    label: "SOLVING PROOF OF WORK",
    icon: "cpu",
    color: "text-accent",
  },
  registering: {
    label: "REGISTERING",
    icon: "send",
    color: "text-accent",
  },
  processing: {
    label: "PROCESSING PURCHASE",
    icon: "spinner",
    color: "text-accent",
  },
  success: {
    label: "SUCCESS",
    icon: "check",
    color: "text-emerald-400",
  },
  error: {
    label: "ERROR",
    icon: "error",
    color: "text-red-400",
  },
};

// Inline SVG icons
const icons = {
  idle: null,
  spinner: (
    <svg
      className="w-4 h-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  ),
  check: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  error: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" />
      <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
    </svg>
  ),
  shield: (
    <svg className="w-4 h-4 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  cpu: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="1" x2="9" y2="4" />
      <line x1="15" y1="1" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="23" />
      <line x1="15" y1="20" x2="15" y2="23" />
      <line x1="20" y1="9" x2="23" y2="9" />
      <line x1="20" y1="14" x2="23" y2="14" />
      <line x1="1" y1="9" x2="4" y2="9" />
      <line x1="1" y1="14" x2="4" y2="14" />
    </svg>
  ),
  send: (
    <svg className="w-4 h-4 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  ),
};

export function ActionStatus({
  step,
  progress = 0,
  message,
  position,
}: ActionStatusProps) {
  if (step === "idle") return null;

  const config = stepConfig[step];
  const showProgress = step === "solving";
  const isTerminal = step === "success" || step === "error";

  return (
    <div
      className={clsx(
        "mt-6 overflow-hidden transition-all duration-300",
        "animate-fade-in"
      )}
    >
      {/* Status Card */}
      <div
        className={clsx(
          "relative rounded-xl border px-5 py-4",
          "bg-background-card/50 backdrop-blur-sm",
          step === "success" && "border-emerald-500/30 bg-emerald-950/20",
          step === "error" && "border-red-500/30 bg-red-950/20",
          !isTerminal && "border-border"
        )}
      >
        {/* Header with icon and label */}
        <div className="flex items-center gap-3">
          <div
            className={clsx(
              "flex items-center justify-center w-8 h-8 rounded-lg",
              step === "success" && "bg-emerald-500/20",
              step === "error" && "bg-red-500/20",
              !isTerminal && "bg-accent/10"
            )}
          >
            <span className={config.color}>{icons[config.icon]}</span>
          </div>

          <div className="flex-1 min-w-0">
            <p
              className={clsx(
                "text-xs font-mono tracking-wider",
                config.color
              )}
            >
              {config.label}
            </p>

            {/* Custom message or position */}
            {(message || position) && (
              <p className="text-sm text-foreground mt-0.5 truncate">
                {message || (position && `Position #${position}`)}
              </p>
            )}
          </div>

          {/* Progress percentage for solving */}
          {showProgress && (
            <span className="text-sm font-mono text-accent tabular-nums">
              {Math.round(progress)}%
            </span>
          )}
        </div>

        {/* Progress bar */}
        {showProgress && (
          <div className="mt-4">
            <div className="h-1.5 bg-background rounded-full overflow-hidden">
              <div
                className={clsx(
                  "h-full rounded-full transition-all duration-150 ease-out",
                  "bg-gradient-to-r from-accent to-accent-hover"
                )}
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Hash visualization - decorative */}
            <div className="mt-3 flex items-center gap-2 overflow-hidden">
              <div className="flex gap-0.5">
                {Array.from({ length: 16 }).map((_, i) => (
                  <div
                    key={i}
                    className={clsx(
                      "w-1.5 h-3 rounded-sm transition-all duration-100",
                      i < Math.floor((progress / 100) * 16)
                        ? "bg-accent"
                        : "bg-border"
                    )}
                    style={{
                      animationDelay: `${i * 50}ms`,
                    }}
                  />
                ))}
              </div>
              <span className="text-[10px] font-mono text-foreground-muted truncate">
                {progress > 0 && progress < 100
                  ? `Computing hash ${Math.floor(progress * 1000)}...`
                  : progress >= 100
                    ? "Challenge solved"
                    : "Initializing..."}
              </span>
            </div>
          </div>
        )}

        {/* Step indicators for non-solving states */}
        {!showProgress && !isTerminal && (
          <div className="mt-4 flex items-center gap-2">
            {["challenge", "solving", "registering"].map((s, i) => {
              const stepOrder = ["challenge", "solving", "registering"];
              const currentIndex = stepOrder.indexOf(step);
              const thisIndex = stepOrder.indexOf(s);
              const isComplete = thisIndex < currentIndex;
              const isCurrent = s === step;

              return (
                <div key={s} className="flex items-center gap-2">
                  <div
                    className={clsx(
                      "w-2 h-2 rounded-full transition-all duration-300",
                      isComplete && "bg-accent",
                      isCurrent && "bg-accent animate-pulse",
                      !isComplete && !isCurrent && "bg-border"
                    )}
                  />
                  {i < 2 && (
                    <div
                      className={clsx(
                        "w-8 h-0.5 rounded-full transition-all duration-300",
                        isComplete ? "bg-accent" : "bg-border"
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

