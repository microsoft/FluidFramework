/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Minimal metadata types for eval results.
 * These are self-contained — no dependency on boardGeneration/inputTypes.
 */

import type { CustomPropertyValueType, JsonObject } from "./artifactTypes.js";

/**
 * Per-dimension aggregate statistics across all datasets in a scenario.
 * @legacy
 * @alpha
 */
export interface DimensionAggregate {
	average: number | undefined;
	count: number;
	min: number | undefined;
	max: number | undefined;
}

/**
 * Scenario-level result metadata.
 * @legacy
 * @alpha
 */
export interface ScenarioEvalResultMetadata extends JsonObject {
	totalDatasets: number;
	averageScore: number;
	totalExecutionTimeMs: number;
	generatorModel: string;
	judgeModel: string;
	timestamp: string;
	/** Per-rubric dimension aggregate stats across all datasets. */
	rubricDimensionAggregates: Record<string, DimensionAggregate>;
	/** Sum of all non-null scores across all datasets and dimensions. */
	totalPoints: number;
	/** Maximum possible points (count × scale max per dimension). */
	maxPossiblePoints: number;
	/** Overall percentage: (totalPoints / maxPossiblePoints) × 100. */
	overallPercentage: number;
	/** Status classification: 'GOOD' (≥80%), 'PASS' (≥60%), 'NEEDS_IMPROVEMENT' (&lt;60%). */
	status: "GOOD" | "PASS" | "NEEDS_IMPROVEMENT";
}

/**
 * Top-level result for a completed scenario evaluation.
 * @legacy
 * @alpha
 */
export interface ScenarioEvalResult {
	name: string;
	appMetadata: JsonObject;
	/** Scenario-level properties written to results and surfaced in the eval app as columns and filters. */
	customResultProperties?: Record<string, CustomPropertyValueType>;
	datasetResults: DatasetEvalResult[];
	resultMetadata: ScenarioEvalResultMetadata;
	/** Path to the directory containing the scenario-level results if results are written to disk */
	resultDirPath?: string;
}

/**
 * Dataset-level result metadata.
 * @legacy
 * @alpha
 */
export interface DatasetEvalResultMetadata extends JsonObject {
	averageScore: number;
	executionTimeMs: number;
	timestamp: string;
	generatorModel: string;
	judgeModel: string;
}

/**
 * Result for a single dataset within a scenario evaluation.
 * @legacy
 * @alpha
 */
export interface DatasetEvalResult {
	name: string;
	appMetadata: JsonObject;
	evalResult: EvaluationResult[];
	resultMetadata: DatasetEvalResultMetadata;
	/** Path to the directory containing the dataset-level results if results are written to disk */
	resultDirPath?: string;
}

/**
 * Result for a single rubric dimension evaluation.
 * @legacy
 * @alpha
 */
export interface EvaluationResult {
	rubricName: string;
	score: number | undefined; // undefined when an optional rubric is scored N/A
	reasoning: string;
	executionTimeMs: number;
	/**
	 * Additional fields extracted from the LLM response, as configured by
	 * `LlmEvalConfig.additionalFields`. Only present when additional fields
	 * are configured and successfully parsed. Shared across all rubrics in
	 * the same evaluation call.
	 */
	additionalFields?: Record<string, string>;
}
