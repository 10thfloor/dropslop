/**
 * Unit tests for lottery utilities
 *
 * Run with: npx tsx tests/unit/lottery.test.ts
 */

import {
  selectWinners,
  selectWinnersWeighted,
  selectWinnersWithMultipliers,
  calculateUpgradeCost,
  calculateIncrementalCost,
  calculateWinProbability,
  getTotalTickets,
  FenwickTree,
  createLotteryProof,
} from "../../src/lib/lottery.js";
import {
  MerkleTree,
  hashLeaf,
  verifyMerkleProof,
  buildParticipantMerkleTree,
  generateVerifiableSeedFromMerkle,
} from "../../src/lib/merkle.js";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ FAILED: ${message}`);
  }
  console.log(`✅ PASSED: ${message}`);
}

function assertApprox(actual: number, expected: number, tolerance: number, message: string) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`❌ FAILED: ${message} (expected ~${expected}, got ${actual})`);
  }
  console.log(`✅ PASSED: ${message}`);
}

async function runTests() {
  console.log("\n🎰 Lottery Unit Tests\n");
  console.log("=".repeat(50));

  // ==========================================
  // selectWinners (unweighted)
  // ==========================================
  console.log("\n📋 selectWinners (unweighted):\n");

  // Test 1: Basic selection
  {
    const participants = ["alice", "bob", "charlie", "dave", "eve"];
    const winners = selectWinners(participants, 2, "test-seed-1");
    
    assert(winners.length === 2, "Should select exactly 2 winners");
    assert(new Set(winners).size === 2, "Winners should be unique");
    assert(winners.every(w => participants.includes(w)), "Winners should be from participants");
  }

  // Test 2: Deterministic with same seed
  {
    const participants = ["alice", "bob", "charlie", "dave", "eve"];
    const winners1 = selectWinners(participants, 2, "test-seed-2");
    const winners2 = selectWinners(participants, 2, "test-seed-2");
    
    assert(
      JSON.stringify(winners1) === JSON.stringify(winners2),
      "Same seed should produce same winners"
    );
  }

  // Test 3: Different with different seed
  {
    const participants = ["alice", "bob", "charlie", "dave", "eve"];
    const winners1 = selectWinners(participants, 2, "seed-a");
    const winners2 = selectWinners(participants, 2, "seed-b");
    
    // Note: Could theoretically be same by chance, but very unlikely
    assert(
      JSON.stringify(winners1) !== JSON.stringify(winners2),
      "Different seeds should (usually) produce different winners"
    );
  }

  // Test 4: Everyone wins if count >= participants
  {
    const participants = ["alice", "bob"];
    const winners = selectWinners(participants, 5, "test-seed");
    
    assert(winners.length === 2, "Should return all participants when count > length");
    assert(
      participants.every(p => winners.includes(p)),
      "All participants should win"
    );
  }

  // ==========================================
  // selectWinnersWeighted
  // ==========================================
  console.log("\n📋 selectWinnersWeighted:\n");

  // Test 5: Basic weighted selection
  {
    const participantTickets = {
      alice: 5,   // 50% of pool
      bob: 3,     // 30% of pool
      charlie: 2, // 20% of pool
    };
    const winners = selectWinnersWeighted(participantTickets, 2, "weighted-seed-1");
    
    assert(winners.length === 2, "Should select exactly 2 winners");
    assert(new Set(winners).size === 2, "Winners should be unique");
  }

  // Test 6: Deterministic weighted selection
  {
    const participantTickets = { alice: 5, bob: 3, charlie: 2 };
    const winners1 = selectWinnersWeighted(participantTickets, 2, "weighted-seed-2");
    const winners2 = selectWinnersWeighted(participantTickets, 2, "weighted-seed-2");
    
    assert(
      JSON.stringify(winners1) === JSON.stringify(winners2),
      "Same seed should produce same weighted winners"
    );
  }

  // Test 7: Higher tickets = higher win rate (statistical)
  {
    const participantTickets = {
      whale: 100,  // 100 tickets
      minnow: 1,   // 1 ticket
    };
    
    let whaleWins = 0;
    let minnowWins = 0;
    
    // Run 100 trials with different seeds
    for (let i = 0; i < 100; i++) {
      const winners = selectWinnersWeighted(participantTickets, 1, `fairness-test-${i}`);
      if (winners[0] === "whale") whaleWins++;
      if (winners[0] === "minnow") minnowWins++;
    }
    
    // Whale should win most of the time (has 99% of tickets)
    assert(
      whaleWins > 80,
      `User with 100x tickets should win most trials (whale: ${whaleWins}, minnow: ${minnowWins})`
    );
  }

  // Test 8: Everyone wins if fewer participants than prizes
  {
    const participantTickets = { alice: 5, bob: 3 };
    const winners = selectWinnersWeighted(participantTickets, 10, "test-seed");
    
    assert(winners.length === 2, "Should return all participants");
    assert(winners.includes("alice") && winners.includes("bob"), "Both should win");
  }

  // Test 9: Empty participants
  {
    const winners = selectWinnersWeighted({}, 5, "test-seed");
    assert(winners.length === 0, "Empty participants should return empty winners");
  }

  // ==========================================
  // calculateUpgradeCost (quadratic pricing)
  // ==========================================
  console.log("\n📋 calculateUpgradeCost:\n");

  // Test 10: First ticket is free
  {
    const cost = calculateUpgradeCost(1, 1.0);
    assert(cost === 0, "First ticket should be free");
  }

  // Test 11: Second ticket costs 1²
  {
    const cost = calculateUpgradeCost(2, 1.0);
    assert(cost === 1, "2 tickets should cost 1 (1²)");
  }

  // Test 12: Third ticket costs 1² + 2²
  {
    const cost = calculateUpgradeCost(3, 1.0);
    assert(cost === 5, "3 tickets should cost 5 (1² + 2²)");
  }

  // Test 13: Formula verification: n(n-1)(2n-1)/6
  {
    const cost = calculateUpgradeCost(5, 1.0);
    // n=4 paid tickets: 1² + 2² + 3² + 4² = 1 + 4 + 9 + 16 = 30
    assert(cost === 30, "5 tickets should cost 30");
  }

  // Test 14: Price unit multiplier
  {
    const cost = calculateUpgradeCost(3, 2.5);
    // (1 + 4) * 2.5 = 12.5
    assert(cost === 12.5, "Price unit should multiply cost");
  }

  // ==========================================
  // calculateIncrementalCost
  // ==========================================
  console.log("\n📋 calculateIncrementalCost:\n");

  // Test 15: Adding first ticket (0→1) is free
  {
    const cost = calculateIncrementalCost(0, 1.0);
    assert(cost === 0, "First ticket is free");
  }

  // Test 16: Adding second ticket (1→2) costs 1²
  {
    const cost = calculateIncrementalCost(1, 1.0);
    assert(cost === 1, "Second ticket costs 1²");
  }

  // Test 17: Adding nth ticket costs (n-1)²
  {
    const cost = calculateIncrementalCost(4, 1.0);
    assert(cost === 16, "5th ticket costs 4² = 16");
  }

  // ==========================================
  // calculateWinProbability
  // ==========================================
  console.log("\n📋 calculateWinProbability:\n");

  // Test 18: Zero tickets = zero probability
  {
    const prob = calculateWinProbability(0, 100, 10);
    assert(prob === 0, "Zero tickets should have zero probability");
  }

  // Test 19: Everyone wins if inventory >= totalTickets
  {
    const prob = calculateWinProbability(5, 100, 200);
    assert(prob === 1, "Should be 100% if inventory >= total");
  }

  // Test 20: Probability scales with tickets
  {
    const prob1 = calculateWinProbability(1, 100, 10);
    const prob10 = calculateWinProbability(10, 100, 10);
    
    assert(prob10 > prob1, "More tickets should have higher probability");
  }

  // ==========================================
  // getTotalTickets
  // ==========================================
  console.log("\n📋 getTotalTickets:\n");

  // Test 21: Sum tickets correctly
  {
    const participantTickets = { alice: 5, bob: 3, charlie: 2 };
    const total = getTotalTickets(participantTickets);
    assert(total === 10, "Should sum all tickets");
  }

  // Test 22: Empty map
  {
    const total = getTotalTickets({});
    assert(total === 0, "Empty map should return 0");
  }

  // ==========================================
  // FenwickTree Tests
  // ==========================================
  console.log("\n📋 FenwickTree:\n");

  // Test 23: Basic construction and total sum
  {
    const weights = [5, 3, 2, 10];
    const tree = FenwickTree.fromWeights(weights);
    assert(tree.totalSum() === 20, "Total sum should be 20");
  }

  // Test 24: Prefix sum queries
  {
    const weights = [5, 3, 2, 10];
    const tree = FenwickTree.fromWeights(weights);
    
    assert(tree.prefixSum(0) === 5, "Prefix sum at 0 should be 5");
    assert(tree.prefixSum(1) === 8, "Prefix sum at 1 should be 8 (5+3)");
    assert(tree.prefixSum(2) === 10, "Prefix sum at 2 should be 10 (5+3+2)");
    assert(tree.prefixSum(3) === 20, "Prefix sum at 3 should be 20 (5+3+2+10)");
  }

  // Test 25: Get individual weight
  {
    const weights = [5, 3, 2, 10];
    const tree = FenwickTree.fromWeights(weights);
    
    assert(tree.getWeight(0) === 5, "Weight at 0 should be 5");
    assert(tree.getWeight(1) === 3, "Weight at 1 should be 3");
    assert(tree.getWeight(2) === 2, "Weight at 2 should be 2");
    assert(tree.getWeight(3) === 10, "Weight at 3 should be 10");
  }

  // Test 26: Update (add delta)
  {
    const weights = [5, 3, 2, 10];
    const tree = FenwickTree.fromWeights(weights);
    
    tree.update(1, 7); // Add 7 to index 1 (3 -> 10)
    assert(tree.getWeight(1) === 10, "Weight at 1 should be 10 after update");
    assert(tree.totalSum() === 27, "Total sum should be 27 after update");
  }

  // Test 27: Update to remove (set to 0)
  {
    const weights = [5, 3, 2, 10];
    const tree = FenwickTree.fromWeights(weights);
    
    // Remove element at index 2 by subtracting its weight
    tree.update(2, -2);
    assert(tree.getWeight(2) === 0, "Weight at 2 should be 0 after removal");
    assert(tree.totalSum() === 18, "Total sum should be 18 after removal");
  }

  // Test 28: findIndex (binary search for cumulative weight)
  {
    const weights = [5, 3, 2, 10]; // cumulative: [5, 8, 10, 20]
    const tree = FenwickTree.fromWeights(weights);
    
    // Target 0-4 should find index 0 (first element has weight 5)
    assert(tree.findIndex(0) === 0, "findIndex(0) should be 0");
    assert(tree.findIndex(4) === 0, "findIndex(4) should be 0");
    
    // Target 5-7 should find index 1 (cumsum > 5)
    assert(tree.findIndex(5) === 1, "findIndex(5) should be 1");
    assert(tree.findIndex(7) === 1, "findIndex(7) should be 1");
    
    // Target 8-9 should find index 2 (cumsum > 8)
    assert(tree.findIndex(8) === 2, "findIndex(8) should be 2");
    
    // Target 10-19 should find index 3 (cumsum > 10)
    assert(tree.findIndex(10) === 3, "findIndex(10) should be 3");
    assert(tree.findIndex(19) === 3, "findIndex(19) should be 3");
  }

  // ==========================================
  // selectWinnersWithMultipliers (Fenwick Tree based)
  // ==========================================
  console.log("\n📋 selectWinnersWithMultipliers (Fenwick Tree):\n");

  // Test 29: Basic selection with multipliers
  {
    const participantTickets = { alice: 5, bob: 3, charlie: 2 };
    const participantMultipliers = { alice: 1.0, bob: 1.5, charlie: 2.0 };
    // Effective: alice=5, bob=4 (floor(3*1.5)), charlie=4 (floor(2*2))
    
    const winners = selectWinnersWithMultipliers(
      participantTickets,
      participantMultipliers,
      2,
      "multiplier-seed-1"
    );
    
    assert(winners.length === 2, "Should select exactly 2 winners");
    assert(new Set(winners).size === 2, "Winners should be unique");
  }

  // Test 30: Deterministic selection with same seed
  {
    const participantTickets = { alice: 5, bob: 3, charlie: 2 };
    const participantMultipliers = { alice: 1.0, bob: 1.5, charlie: 2.0 };
    
    const winners1 = selectWinnersWithMultipliers(
      participantTickets,
      participantMultipliers,
      2,
      "deterministic-seed"
    );
    const winners2 = selectWinnersWithMultipliers(
      participantTickets,
      participantMultipliers,
      2,
      "deterministic-seed"
    );
    
    assert(
      JSON.stringify(winners1) === JSON.stringify(winners2),
      "Same seed should produce identical winners (Fenwick)"
    );
  }

  // Test 31: Different seeds produce different results
  {
    // Use more participants to reduce collision chance
    const participantTickets: Record<string, number> = {};
    const participantMultipliers: Record<string, number> = {};
    for (let i = 0; i < 20; i++) {
      participantTickets[`user_${i}`] = 5;
      participantMultipliers[`user_${i}`] = 1.0;
    }
    
    const winners1 = selectWinnersWithMultipliers(
      participantTickets,
      participantMultipliers,
      3,
      "seed-different-1"
    );
    const winners2 = selectWinnersWithMultipliers(
      participantTickets,
      participantMultipliers,
      3,
      "seed-different-2"
    );
    
    // Very unlikely to be the same with 20 participants choosing 3
    assert(
      JSON.stringify(winners1) !== JSON.stringify(winners2),
      "Different seeds should (usually) produce different winners"
    );
  }

  // Test 32: Higher effective tickets = higher win rate (statistical)
  {
    const participantTickets = { whale: 10, minnow: 1 };
    const participantMultipliers = { whale: 10.0, minnow: 1.0 };
    // Effective: whale=100, minnow=1
    
    let whaleWins = 0;
    
    for (let i = 0; i < 100; i++) {
      const winners = selectWinnersWithMultipliers(
        participantTickets,
        participantMultipliers,
        1,
        `fairness-fenwick-${i}`
      );
      if (winners[0] === "whale") whaleWins++;
    }
    
    assert(
      whaleWins > 80,
      `User with 100x effective tickets should win most trials (whale: ${whaleWins}/100)`
    );
  }

  // Test 33: Everyone wins if count >= participants
  {
    const participantTickets = { alice: 5, bob: 3 };
    const participantMultipliers = { alice: 1.0, bob: 1.0 };
    
    const winners = selectWinnersWithMultipliers(
      participantTickets,
      participantMultipliers,
      10,
      "all-win-seed"
    );
    
    assert(winners.length === 2, "Should return all participants when count > length");
    assert(
      winners.includes("alice") && winners.includes("bob"),
      "Both participants should win"
    );
  }

  // Test 34: Empty participants returns empty array
  {
    const winners = selectWinnersWithMultipliers({}, {}, 5, "empty-seed");
    assert(winners.length === 0, "Empty participants should return empty winners");
  }

  // Test 35: Default multiplier of 1.0 when not specified
  {
    const participantTickets = { alice: 5, bob: 3 };
    const participantMultipliers = { alice: 2.0 }; // bob not specified
    
    const winners = selectWinnersWithMultipliers(
      participantTickets,
      participantMultipliers,
      2,
      "default-multiplier-seed"
    );
    
    assert(winners.length === 2, "Should handle missing multipliers gracefully");
  }

  // ==========================================
  // Large Scale Test (Memory Efficiency)
  // ==========================================
  console.log("\n📋 Large Scale Test (Memory Efficiency):\n");

  // Test 36: 100k participants should not OOM
  {
    const startMemory = process.memoryUsage().heapUsed;
    const startTime = Date.now();
    
    const participantTickets: Record<string, number> = {};
    const participantMultipliers: Record<string, number> = {};
    
    // Create 100,000 participants with varying tickets
    for (let i = 0; i < 100_000; i++) {
      const userId = `user_${i.toString().padStart(6, "0")}`;
      participantTickets[userId] = Math.floor(Math.random() * 10) + 1; // 1-10 tickets
      participantMultipliers[userId] = 1.0 + Math.random() * 0.5; // 1.0-1.5 multiplier
    }
    
    // Select 1000 winners
    const winners = selectWinnersWithMultipliers(
      participantTickets,
      participantMultipliers,
      1000,
      "large-scale-seed"
    );
    
    const endTime = Date.now();
    const endMemory = process.memoryUsage().heapUsed;
    const memoryUsedMB = (endMemory - startMemory) / 1024 / 1024;
    const durationMs = endTime - startTime;
    
    console.log(`   100k participants, 1000 winners:`);
    console.log(`   - Duration: ${durationMs}ms`);
    console.log(`   - Memory delta: ${memoryUsedMB.toFixed(2)}MB`);
    
    assert(winners.length === 1000, "Should select exactly 1000 winners from 100k participants");
    assert(new Set(winners).size === 1000, "All 1000 winners should be unique");
    assert(durationMs < 5000, "Should complete in under 5 seconds");
    assert(memoryUsedMB < 100, "Should use less than 100MB additional memory");
  }

  // Test 37: Determinism with large dataset
  {
    const participantTickets: Record<string, number> = {};
    const participantMultipliers: Record<string, number> = {};
    
    for (let i = 0; i < 10_000; i++) {
      const userId = `user_${i}`;
      participantTickets[userId] = (i % 10) + 1;
      participantMultipliers[userId] = 1.0;
    }
    
    const winners1 = selectWinnersWithMultipliers(
      participantTickets,
      participantMultipliers,
      100,
      "large-determinism-seed"
    );
    const winners2 = selectWinnersWithMultipliers(
      participantTickets,
      participantMultipliers,
      100,
      "large-determinism-seed"
    );
    
    assert(
      JSON.stringify(winners1) === JSON.stringify(winners2),
      "Large dataset should be deterministic with same seed"
    );
  }

  // ==========================================
  // Algorithm Tag Test
  // ==========================================
  console.log("\n📋 Algorithm Tag:\n");

  // Test 38: createLotteryProof uses new algorithm tag
  {
    const proofResult = createLotteryProof(
      "test-secret",
      "test-commitment",
      { alice: 5, bob: 3 },
      { alice: 1.0, bob: 1.0 },
      ["alice"],
      ["bob"]
    );
    
    assert(
      proofResult.proof.algorithm === "weighted-fenwick-v2",
      `Algorithm should be 'weighted-fenwick-v2', got '${proofResult.proof.algorithm}'`
    );
  }

  // ==========================================
  // Merkle Tree Tests
  // ==========================================
  console.log("\n📋 MerkleTree:\n");

  // Test 39: Basic Merkle tree construction
  {
    const participantTickets = { alice: 5, bob: 3, charlie: 2 };
    const participantMultipliers = { alice: 1.0, bob: 1.5, charlie: 2.0 };
    
    const tree = MerkleTree.fromParticipants(participantTickets, participantMultipliers);
    
    assert(tree.size === 3, "Tree should have 3 leaves");
    assert(tree.root.length === 64, "Root should be 64-char hex string (SHA256)");
  }

  // Test 40: Deterministic Merkle root
  {
    const participantTickets = { alice: 5, bob: 3, charlie: 2 };
    const participantMultipliers = { alice: 1.0, bob: 1.5, charlie: 2.0 };
    
    const tree1 = MerkleTree.fromParticipants(participantTickets, participantMultipliers);
    const tree2 = MerkleTree.fromParticipants(participantTickets, participantMultipliers);
    
    assert(tree1.root === tree2.root, "Same participants should produce same Merkle root");
  }

  // Test 41: Different participants produce different roots
  {
    const tree1 = MerkleTree.fromParticipants(
      { alice: 5, bob: 3 },
      { alice: 1.0, bob: 1.0 }
    );
    const tree2 = MerkleTree.fromParticipants(
      { alice: 5, bob: 4 }, // Different ticket count
      { alice: 1.0, bob: 1.0 }
    );
    
    assert(tree1.root !== tree2.root, "Different participants should produce different roots");
  }

  // Test 42: Leaf hash format
  {
    const leaf = { userId: "alice", effectiveTickets: 5, index: 0 };
    const hash = hashLeaf(leaf);
    
    assert(hash.length === 64, "Leaf hash should be 64-char hex string");
  }

  // Test 43: Generate and verify Merkle proof
  {
    const participantTickets = { alice: 5, bob: 3, charlie: 2, dave: 4 };
    const participantMultipliers = { alice: 1.0, bob: 1.0, charlie: 1.0, dave: 1.0 };
    
    const tree = MerkleTree.fromParticipants(participantTickets, participantMultipliers);
    
    // Get proof for bob
    const proof = tree.getProof("bob");
    assert(proof !== null, "Should generate proof for existing user");
    assert(proof!.leaf.userId === "bob", "Proof should be for bob");
    assert(proof!.root === tree.root, "Proof root should match tree root");
    
    // Verify the proof
    const verified = verifyMerkleProof(proof!.leaf, proof!.proof, tree.root);
    assert(verified, "Proof should verify successfully");
  }

  // Test 44: Invalid proof should fail verification
  {
    const participantTickets = { alice: 5, bob: 3, charlie: 2 };
    const participantMultipliers = { alice: 1.0, bob: 1.0, charlie: 1.0 };
    
    const tree = MerkleTree.fromParticipants(participantTickets, participantMultipliers);
    const proof = tree.getProof("bob");
    
    // Tamper with the leaf data
    const tamperedLeaf = { ...proof!.leaf, effectiveTickets: 999 };
    const verified = verifyMerkleProof(tamperedLeaf, proof!.proof, tree.root);
    
    assert(!verified, "Tampered proof should fail verification");
  }

  // Test 45: Non-existent user returns null proof
  {
    const participantTickets = { alice: 5, bob: 3 };
    const participantMultipliers = { alice: 1.0, bob: 1.0 };
    
    const tree = MerkleTree.fromParticipants(participantTickets, participantMultipliers);
    const proof = tree.getProof("charlie");
    
    assert(proof === null, "Should return null for non-existent user");
  }

  // Test 46: Proof size is O(log N)
  {
    const participantTickets: Record<string, number> = {};
    const participantMultipliers: Record<string, number> = {};
    
    // Create 1000 participants
    for (let i = 0; i < 1000; i++) {
      participantTickets[`user_${i}`] = 5;
      participantMultipliers[`user_${i}`] = 1.0;
    }
    
    const tree = MerkleTree.fromParticipants(participantTickets, participantMultipliers);
    const proof = tree.getProof("user_500");
    
    // log2(1000) ≈ 10, so proof should have ~10 hashes
    assert(proof!.proof.length <= 15, `Proof should have O(log N) hashes, got ${proof!.proof.length}`);
    assert(proof!.proof.length >= 8, `Proof should have at least 8 hashes for 1000 participants`);
    
    // Verify this proof works
    const verified = verifyMerkleProof(proof!.leaf, proof!.proof, tree.root);
    assert(verified, "Large tree proof should verify");
  }

  // Test 47: buildParticipantMerkleTree helper
  {
    const participantTickets = { alice: 5, bob: 3 };
    const participantMultipliers = { alice: 1.0, bob: 1.0 };
    
    const result = buildParticipantMerkleTree(participantTickets, participantMultipliers);
    
    assert(result.root.length === 64, "Should return valid root");
    assert(result.leaves.length === 2, "Should return 2 leaves");
    assert(result.leafHashes.length === 2, "Should return 2 leaf hashes");
  }

  // Test 48: generateVerifiableSeedFromMerkle
  {
    const secret = "test-secret-123";
    const merkleRoot = "abc123def456";
    
    const seed1 = generateVerifiableSeedFromMerkle(secret, merkleRoot);
    const seed2 = generateVerifiableSeedFromMerkle(secret, merkleRoot);
    
    assert(seed1 === seed2, "Same inputs should produce same seed");
    assert(seed1.length === 64, "Seed should be 64-char hex string");
    
    // Different root should produce different seed
    const seed3 = generateVerifiableSeedFromMerkle(secret, "different-root");
    assert(seed1 !== seed3, "Different root should produce different seed");
  }

  // Test 49: createLotteryProof returns Merkle-based proof
  {
    const proofResult = createLotteryProof(
      "test-secret",
      "test-commitment",
      { alice: 5, bob: 3, charlie: 2 },
      { alice: 1.0, bob: 1.5, charlie: 2.0 },
      ["alice"],
      ["bob"]
    );
    
    assert(proofResult.proof.participantMerkleRoot.length === 64, "Should have Merkle root");
    assert(proofResult.proof.participantCount === 3, "Should have participant count");
    assert(proofResult.leaves.length === 3, "Should return leaves for proof generation");
    assert(proofResult.leafHashes.length === 3, "Should return leaf hashes");
  }

  // Test 50: Large scale Merkle tree (memory efficiency)
  {
    const startMemory = process.memoryUsage().heapUsed;
    const startTime = Date.now();
    
    const participantTickets: Record<string, number> = {};
    const participantMultipliers: Record<string, number> = {};
    
    // Create 100,000 participants
    for (let i = 0; i < 100_000; i++) {
      const userId = `user_${i.toString().padStart(6, "0")}`;
      participantTickets[userId] = Math.floor(Math.random() * 10) + 1;
      participantMultipliers[userId] = 1.0 + Math.random() * 0.5;
    }
    
    const tree = MerkleTree.fromParticipants(participantTickets, participantMultipliers);
    
    // Generate a few proofs
    const proof1 = tree.getProof("user_000001");
    const proof2 = tree.getProof("user_050000");
    const proof3 = tree.getProof("user_099999");
    
    const endTime = Date.now();
    const endMemory = process.memoryUsage().heapUsed;
    const memoryUsedMB = (endMemory - startMemory) / 1024 / 1024;
    const durationMs = endTime - startTime;
    
    console.log(`   100k participants Merkle tree:`);
    console.log(`   - Duration: ${durationMs}ms`);
    console.log(`   - Memory delta: ${memoryUsedMB.toFixed(2)}MB`);
    console.log(`   - Proof size: ${proof1!.proof.length} hashes (~${proof1!.proof.length * 64} bytes)`);
    
    assert(tree.root.length === 64, "Should produce valid root");
    assert(proof1 !== null && proof2 !== null && proof3 !== null, "Should generate proofs");
    assert(verifyMerkleProof(proof1!.leaf, proof1!.proof, tree.root), "Proof 1 should verify");
    assert(verifyMerkleProof(proof2!.leaf, proof2!.proof, tree.root), "Proof 2 should verify");
    assert(verifyMerkleProof(proof3!.leaf, proof3!.proof, tree.root), "Proof 3 should verify");
    assert(durationMs < 10000, "Should complete in under 10 seconds");
  }

  console.log("\n" + "=".repeat(50));
  console.log("✅ All lottery tests passed!\n");
}

runTests().catch((err) => {
  console.error("\n❌ Test failed:", err.message);
  process.exit(1);
});

