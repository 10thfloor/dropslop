/**
 * Unit tests for lottery utilities
 *
 * Run with: npx tsx tests/unit/lottery.test.ts
 */

import {
  selectWinners,
  selectWinnersWeighted,
  calculateUpgradeCost,
  calculateIncrementalCost,
  calculateWinProbability,
  getTotalTickets,
} from "../../src/lib/lottery.js";

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

  console.log("\n" + "=".repeat(50));
  console.log("✅ All lottery tests passed!\n");
}

runTests().catch((err) => {
  console.error("\n❌ Test failed:", err.message);
  process.exit(1);
});

