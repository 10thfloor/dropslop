"use client";

import { useState } from "react";
import { clsx } from "clsx";
import * as Dialog from "@radix-ui/react-dialog";
import type { Phase, LotteryProof, UserInclusionProof } from "@/lib/types";

interface LotteryProofDisplayProps {
  phase: Phase;
  commitment?: string;
  dropId: string;
  userId?: string; // Optional: for fetching user's inclusion proof
}

/**
 * Displays lottery provability information:
 * - Before lottery: Shows commitment hash (proves randomness was locked)
 * - After lottery: Shows verify button to view full proof
 */
export function LotteryProofDisplay({
  phase,
  commitment,
  dropId,
  userId,
}: LotteryProofDisplayProps) {
  const [showProof, setShowProof] = useState(false);
  const [proof, setProof] = useState<LotteryProof | null>(null);
  const [inclusionProof, setInclusionProof] = useState<UserInclusionProof | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingInclusion, setLoadingInclusion] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canVerify = phase === "purchase" || phase === "completed";

  const fetchProof = async () => {
    setLoading(true);
    setError(null);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003";
      const response = await fetch(
        `${apiUrl}/api/drop/${dropId}/lottery-proof`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch proof");
      }
      const data = await response.json();
      setProof(data);
      setShowProof(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load proof");
    } finally {
      setLoading(false);
    }
  };

  const fetchInclusionProof = async () => {
    if (!userId) return;
    setLoadingInclusion(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003";
      const response = await fetch(
        `${apiUrl}/api/drop/${dropId}/inclusion-proof/${userId}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch inclusion proof");
      }
      const data = await response.json();
      if (data.available && data.proof) {
        setInclusionProof(data.proof);
      }
    } catch (err) {
      console.error("Failed to fetch inclusion proof:", err);
    } finally {
      setLoadingInclusion(false);
    }
  };

  // During registration - show commitment (proves randomness was locked in advance)
  if (phase === "registration" && commitment) {
    return (
      <div className="flex items-center justify-center gap-2 text-xs text-foreground-muted">
        <svg
          className="w-3.5 h-3.5 text-emerald-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
        <span>Verifiable lottery</span>
        
        <Dialog.Root open={showProof} onOpenChange={setShowProof}>
          <Dialog.Trigger asChild>
            <button
              type="button"
              className="text-accent hover:text-accent/80 underline underline-offset-2"
            >
              Learn more
            </button>
          </Dialog.Trigger>
          
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
            <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl border border-border rounded-2xl p-5 shadow-2xl text-left bg-[#171717] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
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
                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                      />
                    </svg>
                  </div>
                  <Dialog.Title className="text-lg font-semibold text-foreground">
                    Verifiable Lottery
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
                    This lottery uses a{" "}
                    <span className="text-accent font-medium">
                      commit-reveal scheme
                    </span>{" "}
                    to prove the results weren't manipulated.
                  </p>
                  
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent flex-shrink-0">
                        1
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Before Registration
                        </p>
                        <p className="text-xs text-foreground-muted">
                          A secret random value was generated and its hash
                          (commitment) was locked in.
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent flex-shrink-0">
                        2
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          After Registration
                        </p>
                        <p className="text-xs text-foreground-muted">
                          The secret is combined with all participant data to
                          generate winners.
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent flex-shrink-0">
                        3
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Verification
                        </p>
                        <p className="text-xs text-foreground-muted">
                          Anyone can verify: hash(secret) = commitment, and
                          re-run the lottery.
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-3 rounded-lg bg-background border border-border">
                    <p className="text-[10px] uppercase tracking-wider text-foreground-muted mb-1">
                      Commitment Hash
                    </p>
                    <code className="text-xs font-mono text-emerald-400 break-all">
                      {commitment}
                    </code>
                  </div>
                  
                  <p className="text-[10px] text-foreground-muted text-center italic">
                    The secret will be revealed after the lottery runs.
                  </p>
                </div>
              </Dialog.Description>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    );
  }

  // After lottery - show verify button
  if (canVerify) {
    return (
      <div className="flex flex-col items-center">
        <Dialog.Root open={showProof} onOpenChange={setShowProof}>
          <Dialog.Trigger asChild>
            <button
              type="button"
              onClick={fetchProof}
              disabled={loading}
              className={clsx(
                "flex items-center gap-2 text-xs",
                "text-foreground-muted hover:text-accent transition-colors"
              )}
            >
              <svg
                className="w-3.5 h-3.5 text-emerald-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
              <span className="underline underline-offset-2">
                {loading ? "Loading..." : "Verify lottery results"}
              </span>
            </button>
          </Dialog.Trigger>

          {error && (
            <p className="text-xs text-rose-400 text-center mt-1">{error}</p>
          )}

          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
            <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl max-h-[85vh] overflow-y-auto border border-border rounded-2xl p-5 shadow-2xl text-left bg-[#171717] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <svg
                      className="w-4 h-4 text-emerald-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <div>
                    <Dialog.Title className="text-base font-semibold text-foreground">
                      Lottery Proof
                    </Dialog.Title>
                    <p className="text-[10px] text-foreground-muted">
                      Independently verifiable
                    </p>
                  </div>
                </div>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="p-2 -mr-2 text-foreground-muted hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
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
              
              {/* Content */}
              {proof?.available && proof.proof ? (
                <div className="space-y-4">
                  {/* Verification Status */}
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <div className="flex items-center gap-2">
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
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <span className="text-sm font-medium text-emerald-400">
                        Cryptographically Verified
                      </span>
                    </div>
                    <p className="text-xs text-foreground-secondary mt-1">
                      The commitment matches the revealed secret.
                    </p>
                  </div>

                  {/* Proof Details */}
                  <div className="space-y-3">
                    <ProofField
                      label="Commitment (Before)"
                      value={proof.proof.commitment}
                    />
                    <ProofField
                      label="Secret (Revealed)"
                      value={proof.proof.secret}
                    />
                    <ProofField
                      label="Participant Merkle Root"
                      value={proof.proof.participantMerkleRoot}
                    />
                    <ProofField
                      label="Participants"
                      value={proof.proof.participantCount.toLocaleString()}
                      mono={false}
                    />
                    <ProofField label="Lottery Seed" value={proof.proof.seed} />
                    <ProofField
                      label="Algorithm"
                      value={proof.proof.algorithm}
                      mono={false}
                    />
                    <ProofField 
                      label="Timestamp" 
                      value={new Date(proof.proof.timestamp).toLocaleString()} 
                      mono={false} 
                    />
                  </div>

                  {/* Winners */}
                  <div className="p-3 rounded-lg bg-background border border-border">
                    <p className="text-[10px] uppercase tracking-wider text-foreground-muted mb-2">
                      Winners ({proof.proof.winners.length})
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {proof.proof.winners.slice(0, 10).map((w, i) => (
                        <span
                          key={w}
                          className="text-xs font-mono bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded"
                        >
                          #{i + 1}
                        </span>
                      ))}
                      {proof.proof.winners.length > 10 && (
                        <span className="text-xs text-foreground-muted">
                          +{proof.proof.winners.length - 10} more
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Backup Winners */}
                  {proof.proof.backupWinners.length > 0 && (
                    <div className="p-3 rounded-lg bg-background border border-border">
                      <p className="text-[10px] uppercase tracking-wider text-foreground-muted mb-2">
                        Backup Winners ({proof.proof.backupWinners.length})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {proof.proof.backupWinners.slice(0, 5).map((w, i) => (
                          <span
                            key={w}
                            className="text-xs font-mono bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded"
                          >
                            #{i + 1}
                          </span>
                        ))}
                        {proof.proof.backupWinners.length > 5 && (
                          <span className="text-xs text-foreground-muted">
                            +{proof.proof.backupWinners.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* How to verify */}
                  <div className="p-3 rounded-lg bg-accent/5 border border-accent/20">
                    <p className="text-xs text-foreground-secondary">
                      <span className="font-medium text-accent">
                        How to verify:
                      </span>{" "}
                      1) Compute SHA256(secret) and confirm it matches the commitment.{" "}
                      2) Verify your inclusion proof against the Merkle root.{" "}
                      3) Re-run the weighted Fenwick Tree selection with the seed to reproduce winners.
                    </p>
                  </div>

                  {/* User's Inclusion Proof (if available) */}
                  {userId && (
                  <details className="group">
                      <summary 
                        className="text-xs text-foreground-muted cursor-pointer hover:text-foreground flex items-center gap-1"
                        onClick={() => !inclusionProof && !loadingInclusion && fetchInclusionProof()}
                      >
                        <svg
                          className="w-3 h-3 transition-transform group-open:rotate-90"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                      </svg>
                        {loadingInclusion ? "Loading..." : "View your inclusion proof"}
                    </summary>
                      {inclusionProof && (
                        <div className="mt-2 space-y-2">
                          <div className="p-2 rounded bg-background border border-border">
                            <p className="text-[10px] uppercase tracking-wider text-foreground-muted mb-1">
                              Your Entry
                            </p>
                            <code className="text-xs font-mono text-foreground-secondary">
                              {inclusionProof.leaf.userId}: {inclusionProof.leaf.effectiveTickets} effective tickets (index {inclusionProof.leaf.index})
                            </code>
                          </div>
                          <div className="p-2 rounded bg-background border border-border">
                            <p className="text-[10px] uppercase tracking-wider text-foreground-muted mb-1">
                              Leaf Hash
                            </p>
                            <code className="text-[10px] font-mono text-accent break-all">
                              {inclusionProof.leafHash}
                      </code>
                    </div>
                          <div className="p-2 rounded bg-background border border-border max-h-24 overflow-y-auto">
                            <p className="text-[10px] uppercase tracking-wider text-foreground-muted mb-1">
                              Merkle Proof Path ({inclusionProof.proof.length} hashes)
                            </p>
                            {inclusionProof.proof.map((hash, i) => (
                              <code key={i} className="block text-[9px] font-mono text-foreground-muted break-all">
                                {i + 1}. {hash}
                              </code>
                            ))}
                          </div>
                          <div className={clsx(
                            "p-2 rounded border",
                            inclusionProof.verified 
                              ? "bg-emerald-500/10 border-emerald-500/20" 
                              : "bg-rose-500/10 border-rose-500/20"
                          )}>
                            <p className={clsx(
                              "text-xs font-medium",
                              inclusionProof.verified ? "text-emerald-400" : "text-rose-400"
                            )}>
                              {inclusionProof.verified ? "✓ Proof verified" : "✗ Proof invalid"}
                            </p>
                          </div>
                        </div>
                      )}
                  </details>
                  )}
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-foreground-secondary text-sm">
                    Proof not yet available
                  </p>
                  {proof?.commitment && (
                    <div className="mt-3 p-3 rounded-lg bg-background border border-border">
                      <p className="text-[10px] uppercase tracking-wider text-foreground-muted mb-1">
                        Commitment (locked in)
                      </p>
                      <code className="text-xs font-mono text-accent break-all">
                        {proof.commitment}
                      </code>
                    </div>
                  )}
                </div>
              )}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    );
  }

  return null;
}

function ProofField({ 
  label, 
  value, 
  mono = true,
}: { 
  label: string; 
  value: string; 
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-3 rounded-lg bg-background border border-border group">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] uppercase tracking-wider text-foreground-muted">
          {label}
        </p>
        <button
          type="button"
          onClick={handleCopy}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-foreground-muted hover:text-foreground"
        >
          {copied ? (
            <svg
              className="w-3.5 h-3.5 text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          ) : (
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          )}
        </button>
      </div>
      <code
        className={clsx(
        "text-xs break-all",
        mono ? "font-mono text-accent" : "text-foreground"
        )}
      >
        {value}
      </code>
    </div>
  );
}
