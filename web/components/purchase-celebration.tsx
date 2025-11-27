"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import * as Dialog from "@radix-ui/react-dialog";

interface PurchaseCelebrationProps {
  productName: string;
  dropId?: string;
  onDismiss?: () => void;
}

/**
 * Celebratory modal shown when a user successfully completes their purchase
 * Big moment of joy for winning the drop!
 */
export function PurchaseCelebration({
  productName,
  dropId,
  onDismiss,
}: PurchaseCelebrationProps) {
  const [animationPhase, setAnimationPhase] = useState<"enter" | "celebrate" | "complete">("enter");

  // Animate entry
  useEffect(() => {
    const timer1 = setTimeout(() => setAnimationPhase("celebrate"), 300);
    const timer2 = setTimeout(() => setAnimationPhase("complete"), 1200);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  return (
    <Dialog.Root open={true} onOpenChange={(open) => !open && onDismiss?.()}>
      <Dialog.Portal>
        <Dialog.Overlay 
          className={clsx(
            "fixed inset-0 bg-background/80 backdrop-blur-md",
            "transition-opacity duration-300",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          )}
        />
        
        <Dialog.Content 
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md outline-none"
          onPointerDownOutside={onDismiss}
        >
          {/* Confetti particles */}
          <div className="fixed inset-0 overflow-hidden pointer-events-none">
            {Array.from({ length: 40 }).map((_, i) => {
              const colors = ["bg-emerald-400", "bg-emerald-500", "bg-amber-400", "bg-accent", "bg-white"];
              const color = colors[i % colors.length];
              const size = Math.random() > 0.5 ? "w-2 h-2" : "w-3 h-3";
              const shape = Math.random() > 0.5 ? "rounded-full" : "rounded-sm rotate-45";
              
              return (
                <div
                  key={i}
                  className={clsx(
                    "absolute",
                    size,
                    shape,
                    color,
                    "animate-confetti"
                  )}
                  style={{
                    left: `${Math.random() * 100}%`,
                    top: `-5%`,
                    animationDelay: `${Math.random() * 2}s`,
                    animationDuration: `${3 + Math.random() * 2}s`,
                  }}
                />
              );
            })}
          </div>

          {/* Main Card */}
          <div
            className={clsx(
              "relative rounded-3xl overflow-hidden",
              "bg-gradient-to-b from-emerald-950/50 via-background-card to-background-card",
              "border border-emerald-500/30 shadow-2xl shadow-emerald-500/10",
              "transform transition-all duration-500 ease-out",
              animationPhase === "enter" ? "scale-90 translate-y-8 opacity-0" : "scale-100 translate-y-0 opacity-100"
            )}
          >
            {/* Glow effect */}
            <div className="absolute inset-x-0 -top-20 h-40 bg-emerald-500/20 blur-3xl" />

            {/* Content */}
            <div className="relative p-8 text-center">
              {/* Animated Checkmark */}
              <div className="mb-6">
                <div className="relative inline-flex items-center justify-center">
                  {/* Animated ring */}
                  <div
                    className={clsx(
                      "absolute w-24 h-24 rounded-full border-4 border-emerald-500/20",
                      "transition-all duration-500",
                      animationPhase !== "enter" && "scale-110 opacity-0"
                    )}
                  />
                  <div
                    className={clsx(
                      "absolute w-24 h-24 rounded-full border-4 border-emerald-400",
                      "transition-all duration-700 ease-out",
                      animationPhase === "enter" ? "scale-0 opacity-0" : "scale-100 opacity-100"
                    )}
                  />

                  {/* Checkmark circle */}
                  <div
                    className={clsx(
                      "w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600",
                      "flex items-center justify-center",
                      "transform transition-all duration-500 ease-out",
                      animationPhase === "enter" ? "scale-0" : "scale-100"
                    )}
                  >
                    <svg
                      className={clsx(
                        "w-12 h-12 text-white",
                        "transform transition-all duration-300 delay-300",
                        animationPhase === "enter" ? "scale-0 opacity-0" : "scale-100 opacity-100"
                      )}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                        className={clsx(
                          animationPhase !== "enter" && "animate-draw-check"
                        )}
                        style={{
                          strokeDasharray: 24,
                          strokeDashoffset: animationPhase === "enter" ? 24 : 0,
                          transition: "stroke-dashoffset 0.5s ease-out 0.3s"
                        }}
                      />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Headline */}
              <Dialog.Title
                className={clsx(
                  "text-3xl font-bold text-foreground mb-2",
                  "transform transition-all duration-500 delay-200",
                  animationPhase === "enter" ? "translate-y-4 opacity-0" : "translate-y-0 opacity-100"
                )}
              >
                Congratulations!
              </Dialog.Title>
              <Dialog.Description
                className={clsx(
                  "text-lg text-foreground-secondary mb-8",
                  "transform transition-all duration-500 delay-300",
                  animationPhase === "enter" ? "translate-y-4 opacity-0" : "translate-y-0 opacity-100"
                )}
              >
                You've secured the <span className="text-emerald-400 font-semibold">{productName}</span>
              </Dialog.Description>

              {/* Order Confirmation Card */}
              <div
                className={clsx(
                  "p-5 rounded-2xl bg-background/50 border border-emerald-500/20 mb-6",
                  "transform transition-all duration-500 delay-400",
                  animationPhase === "enter" ? "translate-y-4 opacity-0" : "translate-y-0 opacity-100"
                )}
              >
                <div className="flex items-center justify-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-foreground">Order Confirmed</p>
                    <p className="text-xs text-foreground-secondary">
                      {dropId ? `Drop: ${dropId}` : "Check your email for details"}
                    </p>
                  </div>
                </div>

                {/* What happens next */}
                <div className="space-y-2 text-left">
                  <div className="flex items-center gap-2 text-xs text-foreground-secondary">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-bold text-emerald-400">1</span>
                    </div>
                    <span>Confirmation email sent</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-foreground-secondary">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-bold text-emerald-400">2</span>
                    </div>
                    <span>Order processing begins</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-foreground-secondary">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-bold text-emerald-400">3</span>
                    </div>
                    <span>Shipping notification when dispatched</span>
                  </div>
                </div>
              </div>

              {/* Share moment */}
              <div
                className={clsx(
                  "flex items-center justify-center gap-3 mb-6",
                  "transform transition-all duration-500 delay-500",
                  animationPhase === "enter" ? "translate-y-4 opacity-0" : "translate-y-0 opacity-100"
                )}
              >
                <span className="text-xs text-foreground-muted">Share your win:</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="w-8 h-8 rounded-lg bg-foreground/10 hover:bg-foreground/20 flex items-center justify-center transition-colors"
                    aria-label="Share on Twitter"
                  >
                    <svg className="w-4 h-4 text-foreground-secondary" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="w-8 h-8 rounded-lg bg-foreground/10 hover:bg-foreground/20 flex items-center justify-center transition-colors"
                    aria-label="Copy link"
                  >
                    <svg className="w-4 h-4 text-foreground-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* CTA */}
              <Dialog.Close asChild>
                <button
                  type="button"
                  className={clsx(
                    "w-full py-4 px-8 rounded-xl font-semibold text-sm uppercase tracking-wider",
                    "bg-emerald-500 text-background hover:bg-emerald-400",
                    "transition-all duration-200 active:scale-[0.98]",
                    "transform transition-all duration-500 delay-600",
                    animationPhase === "enter" ? "translate-y-4 opacity-0" : "translate-y-0 opacity-100"
                  )}
                >
                  Done
                </button>
              </Dialog.Close>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
