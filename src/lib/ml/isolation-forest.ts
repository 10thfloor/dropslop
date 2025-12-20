/**
 * Isolation Forest Implementation for Bot Detection
 *
 * Isolation Forest is an unsupervised anomaly detection algorithm that isolates
 * outliers by randomly partitioning data. Anomalies (bots) require fewer partitions
 * to isolate, resulting in shorter path lengths in the decision trees.
 *
 * Requirements: 1.1, 8.5
 */

import {
  FEATURE_COUNT,
  type IsolationForestModel,
  type IsolationTreeNode,
} from "./types.js";

/**
 * Isolation Forest classifier for anomaly detection.
 *
 * Uses pre-trained trees to compute anomaly scores for feature vectors.
 * Higher scores indicate more anomalous (bot-like) behavior.
 */
export class IsolationForest {
  private readonly model: IsolationForestModel;
  private readonly avgPathLength: number;

  /**
   * Create an Isolation Forest from a trained model.
   *
   * @param model - Pre-trained Isolation Forest model
   * @throws Error if model is invalid
   */
  constructor(model: IsolationForestModel) {
    this.validateModel(model);
    this.model = model;
    // Pre-compute average path length for normalization
    this.avgPathLength = this.computeAveragePathLength(model.sampleSize);
  }

  /**
   * Compute anomaly score for a feature vector.
   *
   * The score is normalized to [0, 1] where:
   * - 0 = normal (long path length, hard to isolate)
   * - 1 = anomalous (short path length, easy to isolate)
   *
   * @param features - Numeric feature vector
   * @returns Anomaly score in range [0, 1]
   *
   * Requirement 8.5: Anomaly scores must be in valid 0-1 range
   */
  score(features: number[]): number {
    if (features.length !== this.model.featureCount) {
      throw new Error(
        `Invalid feature vector length: expected ${this.model.featureCount}, got ${features.length}`
      );
    }

    // Compute average path length across all trees
    let totalPathLength = 0;
    for (const tree of this.model.trees) {
      totalPathLength += this.computePathLength(tree, features, 0);
    }
    const avgPathLength = totalPathLength / this.model.trees.length;

    // Normalize to anomaly score using the formula:
    // score = 2^(-avgPathLength / c(n))
    // where c(n) is the average path length of unsuccessful search in BST
    const normalizedScore = Math.pow(
      2,
      -avgPathLength / this.avgPathLength
    );

    // Clamp to [0, 1] to ensure valid range (Requirement 8.5)
    return Math.max(0, Math.min(1, normalizedScore));
  }

  /**
   * Check if a feature vector represents an anomaly (bot).
   *
   * @param features - Numeric feature vector
   * @returns true if anomaly score exceeds threshold
   *
   * Requirement 1.1: Integrate with trust score calculation
   */
  isAnomaly(features: number[]): boolean {
    return this.score(features) >= this.model.threshold;
  }

  /**
   * Get the model's anomaly threshold.
   */
  getThreshold(): number {
    return this.model.threshold;
  }

  /**
   * Get the number of trees in the forest.
   */
  getTreeCount(): number {
    return this.model.trees.length;
  }

  /**
   * Get the expected feature count.
   */
  getFeatureCount(): number {
    return this.model.featureCount;
  }

  // ============================================================
  // Private Methods
  // ============================================================

  /**
   * Validate model structure.
   */
  private validateModel(model: IsolationForestModel): void {
    if (!model.trees || model.trees.length === 0) {
      throw new Error("Model must have at least one tree");
    }
    if (model.sampleSize <= 0) {
      throw new Error("Sample size must be positive");
    }
    if (model.featureCount <= 0) {
      throw new Error("Feature count must be positive");
    }
    if (model.threshold < 0 || model.threshold > 1) {
      throw new Error("Threshold must be in range [0, 1]");
    }
  }

  /**
   * Compute path length for a sample in a tree.
   *
   * Path length is the number of edges traversed from root to termination.
   * For external nodes (leaves), we add an adjustment for the expected
   * path length of the remaining samples.
   *
   * @param node - Current tree node
   * @param features - Feature vector
   * @param currentDepth - Current depth in tree
   * @returns Path length (including adjustment for leaf nodes)
   */
  private computePathLength(
    node: IsolationTreeNode,
    features: number[],
    currentDepth: number
  ): number {
    // Leaf node: return current depth + adjustment for remaining samples
    if (node.splitFeature === null || node.left === null || node.right === null) {
      // Add expected path length for remaining samples at this node
      return currentDepth + this.computeAveragePathLength(node.size);
    }

    // Internal node: traverse based on split
    const featureValue = features[node.splitFeature];
    const splitValue = node.splitValue!;

    if (featureValue < splitValue) {
      return this.computePathLength(node.left, features, currentDepth + 1);
    } else {
      return this.computePathLength(node.right, features, currentDepth + 1);
    }
  }

  /**
   * Compute average path length of unsuccessful search in BST.
   *
   * This is used to normalize path lengths. The formula is:
   * c(n) = 2 * H(n-1) - (2 * (n-1) / n)
   * where H(i) is the harmonic number ≈ ln(i) + 0.5772156649 (Euler's constant)
   *
   * @param n - Number of samples
   * @returns Average path length c(n)
   */
  private computeAveragePathLength(n: number): number {
    if (n <= 1) {
      return 0;
    }
    if (n === 2) {
      return 1;
    }

    // H(n-1) ≈ ln(n-1) + Euler's constant
    const eulerConstant = 0.5772156649;
    const harmonicNumber = Math.log(n - 1) + eulerConstant;

    return 2 * harmonicNumber - (2 * (n - 1)) / n;
  }
}

/**
 * Create a simple Isolation Forest model for testing.
 *
 * This creates a minimal valid model structure. For production use,
 * models should be trained from real data using the training script.
 *
 * @param options - Model configuration options
 * @returns A valid IsolationForestModel
 */
export function createTestModel(options?: {
  numTrees?: number;
  sampleSize?: number;
  threshold?: number;
  featureCount?: number;
}): IsolationForestModel {
  const numTrees = options?.numTrees ?? 10;
  const sampleSize = options?.sampleSize ?? 256;
  const threshold = options?.threshold ?? 0.6;
  const featureCount = options?.featureCount ?? FEATURE_COUNT;

  // Create simple trees that split on different features
  const trees: IsolationTreeNode[] = [];
  for (let i = 0; i < numTrees; i++) {
    trees.push(createSimpleTree(featureCount, sampleSize, i));
  }

  return {
    trees,
    sampleSize,
    contamination: 0.1,
    threshold,
    featureCount,
  };
}

/**
 * Create a simple tree for testing purposes.
 */
function createSimpleTree(
  featureCount: number,
  sampleSize: number,
  seed: number
): IsolationTreeNode {
  // Create a tree with a few levels of splits
  const primaryFeature = seed % featureCount;
  const secondaryFeature = (seed + 1) % featureCount;

  return {
    splitFeature: primaryFeature,
    splitValue: 10 + seed * 5, // Varying split values
    left: {
      splitFeature: secondaryFeature,
      splitValue: 5 + seed * 2,
      left: createLeaf(Math.floor(sampleSize / 4)),
      right: createLeaf(Math.floor(sampleSize / 4)),
      size: Math.floor(sampleSize / 2),
    },
    right: {
      splitFeature: null,
      splitValue: null,
      left: null,
      right: null,
      size: Math.floor(sampleSize / 2),
    },
    size: sampleSize,
  };
}

/**
 * Create a leaf node.
 */
function createLeaf(size: number): IsolationTreeNode {
  return {
    splitFeature: null,
    splitValue: null,
    left: null,
    right: null,
    size: Math.max(1, size),
  };
}
