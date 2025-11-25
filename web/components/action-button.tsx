"use client";

import { clsx } from "clsx";

interface ActionButtonProps {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}

export function ActionButton({
  onClick,
  disabled = false,
  loading = false,
  children,
  variant = "primary",
}: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={clsx(
        "w-full py-4 px-8 rounded font-semibold text-sm uppercase tracking-wider transition-all duration-200",
        "focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background",
        "disabled:cursor-not-allowed",
        variant === "primary" && [
          "bg-accent text-white",
          "hover:bg-accent-hover hover:shadow-lg hover:shadow-accent/20",
          "active:scale-[0.98]",
          "disabled:bg-foreground-muted disabled:text-foreground-secondary disabled:shadow-none",
        ],
        variant === "secondary" && [
          "bg-transparent text-foreground border border-border",
          "hover:bg-background-card hover:border-foreground-muted",
          "disabled:opacity-50",
        ]
      )}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
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
          <span>Processing...</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
