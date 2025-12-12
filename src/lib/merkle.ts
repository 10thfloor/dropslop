/**
 * Merkle Tree implementation for lottery participant verification
 *
 * Provides memory-efficient proofs that a participant was included in the lottery.
 * Instead of storing the full participant snapshot (potentially MBs), we store
 * only the 32-byte Merkle root. Users can request individual inclusion proofs.
 *
 * Memory: O(N) during construction, O(1) for root storage
 * Proof size: O(log N) hashes per user
 * Verification: O(log N) hash operations
 */

import crypto from "node:crypto";

/**
 * Hash function used throughout the Merkle tree
 * Uses SHA-256 for consistency with other lottery hashing
 */
function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Hash two child nodes to create parent
 * Sorts inputs to ensure consistent ordering regardless of left/right position
 */
function hashPair(left: string, right: string): string {
  // Sort to ensure deterministic ordering
  const [a, b] = left < right ? [left, right] : [right, left];
  return sha256(a + b);
}

/**
 * Represents a leaf in the Merkle tree
 * Contains the participant's data for verification
 */
export interface MerkleLeaf {
  userId: string;
  effectiveTickets: number;
  index: number; // Position in sorted participant list
}

/**
 * Merkle proof for a single leaf
 * Contains the path from leaf to root
 */
export interface MerkleProof {
  leaf: MerkleLeaf;
  leafHash: string;
  proof: string[]; // Sibling hashes from leaf to root
  root: string;
}

/**
 * Result of building a Merkle tree
 */
export interface MerkleTreeResult {
  root: string;
  leaves: MerkleLeaf[];
  leafHashes: string[];
}

/**
 * Merkle Tree class for participant verification
 *
 * Builds a binary Merkle tree from participant data.
 * Each leaf is hash(userId:effectiveTickets:index)
 */
export class MerkleTree {
  private leaves: MerkleLeaf[];
  private leafHashes: string[];
  private layers: string[][];
  public readonly root: string;

  private constructor(
    leaves: MerkleLeaf[],
    leafHashes: string[],
    layers: string[][]
  ) {
    this.leaves = leaves;
    this.leafHashes = leafHashes;
    this.layers = layers;
    this.root = layers[layers.length - 1]?.[0] ?? sha256("empty");
  }

  /**
   * Build a Merkle tree from participant data
   * Participants are sorted by userId for deterministic ordering
   *
   * @param participantTickets - Map of userId to ticket count
   * @param participantMultipliers - Map of userId to loyalty multiplier
   */
  static fromParticipants(
    participantTickets: Record<string, number>,
    participantMultipliers: Record<string, number>
  ): MerkleTree {
    // Sort entries by userId for deterministic ordering
    const sortedEntries = Object.entries(participantTickets).sort(([a], [b]) =>
      a.localeCompare(b)
    );

    // Create leaves
    const leaves: MerkleLeaf[] = sortedEntries.map(
      ([userId, tickets], index) => {
        const multiplier = participantMultipliers[userId] ?? 1.0;
        const effectiveTickets = Math.floor(tickets * multiplier);
        return { userId, effectiveTickets, index };
      }
    );

    // Hash leaves
    const leafHashes = leaves.map((leaf) => hashLeaf(leaf));

    // Build tree layers
    const layers = buildLayers(leafHashes);

    return new MerkleTree(leaves, leafHashes, layers);
  }

  /**
   * Get the number of leaves in the tree
   */
  get size(): number {
    return this.leaves.length;
  }

  /**
   * Get all leaves (for storage/reconstruction)
   */
  getLeaves(): MerkleLeaf[] {
    return [...this.leaves];
  }

  /**
   * Get leaf hashes (for verification)
   */
  getLeafHashes(): string[] {
    return [...this.leafHashes];
  }

  /**
   * Get the leaf index for a userId
   * Returns -1 if user not found
   */
  getLeafIndex(userId: string): number {
    return this.leaves.findIndex((leaf) => leaf.userId === userId);
  }

  /**
   * Get a Merkle proof for a specific user
   * The proof allows anyone to verify the user was included in the lottery
   *
   * @param userId - The user to generate proof for
   * @returns MerkleProof or null if user not found
   */
  getProof(userId: string): MerkleProof | null {
    const leafIndex = this.getLeafIndex(userId);
    if (leafIndex === -1) return null;

    return this.getProofByIndex(leafIndex);
  }

  /**
   * Get a Merkle proof by leaf index
   */
  getProofByIndex(leafIndex: number): MerkleProof | null {
    if (leafIndex < 0 || leafIndex >= this.leaves.length) return null;

    const proof: string[] = [];
    let currentIndex = leafIndex;

    // Walk up the tree, collecting sibling hashes
    for (let layer = 0; layer < this.layers.length - 1; layer++) {
      const currentLayer = this.layers[layer];
      const siblingIndex =
        currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;

      // If sibling exists, add to proof; otherwise add self (for odd-length layers)
      if (siblingIndex >= 0 && siblingIndex < currentLayer.length) {
        proof.push(currentLayer[siblingIndex]);
      } else {
        // No sibling - this node gets duplicated, so add itself
        proof.push(currentLayer[currentIndex]);
      }

      // Move to parent index
      currentIndex = Math.floor(currentIndex / 2);
    }

    return {
      leaf: this.leaves[leafIndex],
      leafHash: this.leafHashes[leafIndex],
      proof,
      root: this.root,
    };
  }
}

/**
 * Hash a leaf node
 * Format: SHA256(userId:effectiveTickets:index)
 */
export function hashLeaf(leaf: MerkleLeaf): string {
  return sha256(`${leaf.userId}:${leaf.effectiveTickets}:${leaf.index}`);
}

/**
 * Build all layers of the Merkle tree from leaf hashes
 * Returns array of layers, from leaves (index 0) to root (last index)
 */
function buildLayers(leafHashes: string[]): string[][] {
  if (leafHashes.length === 0) {
    return [[sha256("empty")]];
  }

  const layers: string[][] = [[...leafHashes]];

  while (layers[layers.length - 1].length > 1) {
    const currentLayer = layers[layers.length - 1];
    const nextLayer: string[] = [];

    for (let i = 0; i < currentLayer.length; i += 2) {
      const left = currentLayer[i];
      // If odd number of nodes, duplicate the last one
      const right = currentLayer[i + 1] ?? left;
      nextLayer.push(hashPair(left, right));
    }

    layers.push(nextLayer);
  }

  return layers;
}

/**
 * Verify a Merkle proof
 * Recomputes the root from the leaf and proof, then compares to expected root
 *
 * @param leaf - The leaf data to verify
 * @param proof - Array of sibling hashes from leaf to root
 * @param expectedRoot - The expected Merkle root
 * @returns true if the proof is valid
 */
export function verifyMerkleProof(
  leaf: MerkleLeaf,
  proof: string[],
  expectedRoot: string
): boolean {
  let currentHash = hashLeaf(leaf);
  let currentIndex = leaf.index;

  for (const siblingHash of proof) {
    // Determine if current is left or right child
    if (currentIndex % 2 === 0) {
      // Current is left child
      currentHash = hashPair(currentHash, siblingHash);
    } else {
      // Current is right child
      currentHash = hashPair(siblingHash, currentHash);
    }
    currentIndex = Math.floor(currentIndex / 2);
  }

  return currentHash === expectedRoot;
}

/**
 * Build a Merkle tree and return just the root and leaves
 * More memory-efficient when you don't need to generate proofs immediately
 */
export function buildParticipantMerkleTree(
  participantTickets: Record<string, number>,
  participantMultipliers: Record<string, number>
): MerkleTreeResult {
  const tree = MerkleTree.fromParticipants(
    participantTickets,
    participantMultipliers
  );

  return {
    root: tree.root,
    leaves: tree.getLeaves(),
    leafHashes: tree.getLeafHashes(),
  };
}

/**
 * Generate verifiable lottery seed using Merkle root
 * Combines server secret with Merkle root for deterministic seed generation
 */
export function generateVerifiableSeedFromMerkle(
  secret: string,
  merkleRoot: string
): string {
  return crypto
    .createHash("sha256")
    .update(`${secret}|${merkleRoot}`)
    .digest("hex");
}
