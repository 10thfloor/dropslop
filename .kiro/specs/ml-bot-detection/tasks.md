# Implementation Plan

- [x] 1. Set up ML module structure and configuration
  - [x] 1.1 Create `src/lib/ml/` directory and add ML configuration to `src/lib/config.ts`
    - Add `ml` config section with enabled, modelPath, timeoutMs, weight, anomalyThreshold, training settings
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [x] 1.2 Create feature vector types and constants in `src/lib/ml/types.ts`
    - Define FeatureVector interface, FEATURE_COUNT constant, feature index enum
    - _Requirements: 2.1, 2.5_

- [x] 2. Implement Feature Extractor
  - [x] 2.1 Create `src/lib/ml/feature-extractor.ts` with extractFeatures function
    - Extract behavioral signals (mouse, scroll, keys, focus, visibility, time, variance)
    - Extract fingerprint features (confidence, timing)
    - Handle missing/invalid inputs with defaults
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x]* 2.2 Write property test for feature vector fixed length
    - **Property 3: Feature vector fixed length**
    - **Validates: Requirements 2.5**
  - [x]* 2.3 Write property test for feature extraction completeness
    - **Property 4: Feature extraction completeness**
    - **Validates: Requirements 2.1, 2.2, 2.3**
  - [x]* 2.4 Write property test for missing input defaults
    - **Property 5: Missing input defaults**
    - **Validates: Requirements 2.4**

- [x] 3. Implement Isolation Forest model
  - [x] 3.1 Create `src/lib/ml/isolation-forest.ts` with IsolationForest class
    - Implement tree traversal for path length calculation
    - Implement anomaly score calculation (normalized path length)
    - Implement isAnomaly threshold check
    - _Requirements: 1.1, 8.5_
  - [ ]* 3.2 Write property test for anomaly score bounds
    - **Property 12: Anomaly score bounds**
    - **Validates: Requirements 8.5**

- [ ] 4. Implement Model Serialization
  - [ ] 4.1 Create `src/lib/ml/model-serializer.ts` with load/save functions
    - Implement loadModel with JSON parsing and validation
    - Implement saveModel with JSON serialization
    - Implement validateModelStructure for schema validation
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [ ]* 4.2 Write property test for model serialization round-trip
    - **Property 8: Model serialization round-trip**
    - **Validates: Requirements 6.5**
  - [ ]* 4.3 Write property test for model structure validation
    - **Property 9: Model structure validation**
    - **Validates: Requirements 6.2**

- [ ] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement ML Service
  - [ ] 6.1 Create `src/lib/ml/ml-service.ts` with MLService class
    - Implement initialize() to load model from config path
    - Implement score() with timeout handling and fallback
    - Convert anomaly score to trust component (inverted 0-100)
    - _Requirements: 1.1, 1.2, 1.3, 3.1, 3.2, 3.3, 3.4_
  - [ ]* 6.2 Write property test for anomaly to trust conversion
    - **Property 1: Anomaly score to trust component conversion**
    - **Validates: Requirements 1.1**
  - [ ]* 6.3 Write unit tests for ML Service fallback behavior
    - Test fallback when model disabled, missing, or inference fails
    - _Requirements: 1.2, 1.3, 3.2, 3.3, 3.4_

- [ ] 7. Integrate ML into Trust Score Calculator
  - [ ] 7.1 Update `src/lib/fingerprint.ts` to include ML component in calculateTrustScore
    - Add ML service integration with feature extraction
    - Update weight distribution to include ML component
    - Handle ML disabled/fallback scenarios
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [ ]* 7.2 Write property test for final trust score normalization
    - **Property 2: Final trust score normalization**
    - **Validates: Requirements 1.4**

- [ ] 8. Implement Training Data Collector
  - [ ] 8.1 Create `src/lib/ml/training-collector.ts` with TrainingDataCollector class
    - Implement collect() to log feature vectors with metadata
    - Implement PII exclusion (no raw fingerprints, IPs, user IDs)
    - Implement flush() for batch writing
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - [ ]* 8.2 Write property test for PII exclusion
    - **Property 6: Training data PII exclusion**
    - **Validates: Requirements 5.2**
  - [ ]* 8.3 Write property test for training data completeness
    - **Property 7: Training data completeness**
    - **Validates: Requirements 5.4**

- [ ] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Implement Training Script
  - [ ] 10.1 Create `src/scripts/train-isolation-forest.ts` CLI script
    - Read training data from JSONL file
    - Implement Isolation Forest training algorithm
    - Support configurable numTrees, sampleSize, contamination
    - Output serialized model JSON
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  - [ ]* 10.2 Write property test for training produces valid models
    - **Property 10: Training produces valid models**
    - **Validates: Requirements 7.1, 7.2**
  - [ ]* 10.3 Write property test for contamination affects threshold
    - **Property 11: Contamination affects threshold**
    - **Validates: Requirements 7.4**

- [ ] 11. Create k6 Bot Detection Tests
  - [ ] 11.1 Create `tests/k6/ml-bot-detection.js` with synthetic traffic patterns
    - Implement human-like behavior generator (varied mouse, scrolls, realistic timing)
    - Implement bot-like behavior generator (zero interactions, instant timing)
    - Implement adaptive bot patterns (partial human signals)
    - _Requirements: 8.1, 8.2_
  - [ ] 11.2 Add test scenarios and metrics tracking
    - Pure human traffic scenario (verify <5% block rate)
    - Pure bot traffic scenario (verify >90% block rate)
    - Mixed traffic scenario with accuracy metrics
    - Track ml_anomaly_score, true/false positive rates, inference time
    - _Requirements: 8.3, 8.4, 8.5_

- [ ] 12. Create sample model and documentation
  - [ ] 12.1 Create sample Isolation Forest model for testing
    - Generate `models/sample-isolation-forest.json` with reasonable defaults
    - Document model format and training process in README
    - _Requirements: 6.1_
  - [ ] 12.2 Update Makefile with ML-related commands
    - Add `make ml-train` for training new models
    - Add `make k6-ml-bot` for running ML bot detection tests
    - _Requirements: 7.1_

- [ ] 13. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

