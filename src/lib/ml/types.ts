/**
 * ML Bot Detection Types and Constants
 * Defines feature vector structure and related types for Isolation Forest model
 */

// ============================================================
// Feature Vector Constants
// ============================================================

/**
 * Fixed number of features in the feature vector.
 * This must match the model's expected input size.
 */
export const FEATURE_COUNT = 10;

/**
 * Feature indices for accessing specific features in the vector.
 * Provides type-safe access to feature positions.
 */
export enum FeatureIndex {
  /** Number of mouse movement events */
  MOUSE_MOVEMENTS = 0,
  /** Number of scroll events */
  SCROLL_EVENTS = 1,
  /** Number of key press events */
  KEY_PRESSES = 2,
  /** Number of focus/blur events */
  FOCUS_BLUR_EVENTS = 3,
  /** Number of visibility change events */
  VISIBILITY_CHANGES = 4,
  /** Time spent on page in milliseconds */
  TIME_ON_PAGE_MS = 5,
  /** Variance in interaction patterns (computed metric) */
  INTERACTION_VARIANCE = 6,
  /** Fingerprint confidence score (0-100) */
  FINGERPRINT_CONFIDENCE = 7,
  /** Fingerprint timing in milliseconds */
  TIMING_MS = 8,
  /** Proof-of-work solve time in milliseconds */
  POW_SOLVE_TIME_MS = 9,
}

// ============================================================
// Feature Vector Interface
// ============================================================

/**
 * Structured representation of the feature vector.
 * Used for type-safe feature extraction before conversion to numeric array.
 */
export interface FeatureVector {
  // Behavioral features (7)
  /** Number of mouse movement events detected */
  mouseMovements: number;
  /** Number of scroll events detected */
  scrollEvents: number;
  /** Number of key press events detected */
  keyPresses: number;
  /** Number of focus/blur events detected */
  focusBlurEvents: number;
  /** Number of visibility change events detected */
  visibilityChanges: number;
  /** Time spent on page in milliseconds */
  timeOnPageMs: number;
  /** Computed variance in interaction patterns */
  interactionVariance: number;

  // Fingerprint features (2)
  /** Fingerprint confidence score (0-100) */
  fingerprintConfidence: number;
  /** Fingerprint timing in milliseconds */
  timingMs: number;

  // PoW features (1)
  /** Proof-of-work solve time in milliseconds */
  powSolveTimeMs: number;
}

// ============================================================
// Default Values
// ============================================================

/**
 * Default values for each feature when input is missing or invalid.
 * These represent neutral/conservative values that don't bias the model.
 */
export const FEATURE_DEFAULTS: FeatureVector = {
  mouseMovements: 0,
  scrollEvents: 0,
  keyPresses: 0,
  focusBlurEvents: 0,
  visibilityChanges: 0,
  timeOnPageMs: 0,
  interactionVariance: 0,
  fingerprintConfidence: 50, // Neutral confidence
  timingMs: 1000, // Reasonable default timing
  powSolveTimeMs: 0,
};

// ============================================================
// Isolation Forest Types
// ============================================================

/**
 * A single node in an Isolation Tree.
 * Leaf nodes have null splitFeature/splitValue.
 */
export interface IsolationTreeNode {
  /** Feature index used for splitting, null for leaf nodes */
  splitFeature: number | null;
  /** Threshold value for the split, null for leaf nodes */
  splitValue: number | null;
  /** Left subtree (values < splitValue) */
  left: IsolationTreeNode | null;
  /** Right subtree (values >= splitValue) */
  right: IsolationTreeNode | null;
  /** Number of samples at this node (used for path length calculation) */
  size: number;
}

/**
 * Complete Isolation Forest model structure.
 */
export interface IsolationForestModel {
  /** Array of isolation trees */
  trees: IsolationTreeNode[];
  /** Number of samples used to build each tree */
  sampleSize: number;
  /** Expected proportion of anomalies in training data */
  contamination: number;
  /** Anomaly score threshold (scores above this are anomalies) */
  threshold: number;
  /** Expected number of features in input vectors */
  featureCount: number;
}

// ============================================================
// Serialization Types
// ============================================================

/**
 * Serialized model format for JSON storage.
 */
export interface SerializedModel {
  /** Model format version */
  version: string;
  /** Timestamp when model was created */
  createdAt: number;
  /** Model configuration */
  config: {
    numTrees: number;
    sampleSize: number;
    contamination: number;
    featureCount: number;
  };
  /** Serialized isolation trees */
  trees: IsolationTreeNode[];
  /** Anomaly score threshold */
  threshold: number;
}

// ============================================================
// ML Service Types
// ============================================================

/**
 * Configuration for the ML service.
 */
export interface MLServiceConfig {
  /** Whether ML scoring is enabled */
  enabled: boolean;
  /** Path to the model file */
  modelPath: string;
  /** Maximum inference time in milliseconds */
  timeoutMs: number;
  /** Weight of ML component in trust score (0.0-1.0) */
  weight: number;
  /** Anomaly score threshold for bot classification */
  anomalyThreshold: number;
}

/**
 * Result from ML inference.
 */
export interface MLResult {
  /** Anomaly score from Isolation Forest (0-1, higher = more bot-like) */
  anomalyScore: number;
  /** Trust component for score calculation (0-100, higher = more trustworthy) */
  trustComponent: number;
  /** Whether fallback scoring was used */
  usedFallback: boolean;
}

// ============================================================
// Training Types
// ============================================================

/**
 * Configuration for training data collection.
 */
export interface TrainingCollectorConfig {
  /** Whether training data collection is enabled */
  enabled: boolean;
  /** Output path for training data file */
  outputPath: string;
  /** Fraction of requests to sample (0.0-1.0) */
  sampleRate: number;
}

/**
 * A single training data record.
 */
export interface TrainingRecord {
  /** Timestamp when the record was created */
  timestamp: number;
  /** Feature vector values */
  features: number[];
  /** Final trust score */
  trustScore: number;
  /** Anomaly score from ML (null if ML was disabled) */
  anomalyScore: number | null;
  /** Whether the request was allowed */
  allowed: boolean;
}
