/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	AdditionalFieldConfig,
	ImageInput,
	JsonObject,
	Rubric,
	ScoreScale,
} from "../artifactTypes.js";
import type { Logger } from "../loggerTypes.js";
import type { EvaluationResult } from "../resultTypes.js";

/**
 * Context provided to evaluators during evaluation
 * @legacy
 * @alpha
 */
export interface EvaluationContext {
	/** Structured input data that produced this output (if available) */
	input?: JsonObject;
	/** Output state after generation */
	output: JsonObject;
	/** Images to include in the evaluation (file paths or base64 data) */
	images?: ImageInput[];
	/** Evaluator-specific configuration */
	judgeModel: string;
	/** Rubrics for LLM-as-judge evaluation (from llmEvalConfig) */
	rubrics: Rubric[];
	/** Default scoring scale for all rubrics that don't specify their own (default: \{ min: 0, max: 5 \}) */
	defaultScale?: ScoreScale;
	/** Prompt describing how to interpret the input/output data (from llmEvalConfig) */
	dataInterpretationPrompt?: string;
	/** Dataset-level metadata, passed through from DatasetArtifact.metadata */
	metadata?: JsonObject;
	/** Logger for evaluators to log info/warnings/errors */
	logger: Logger;
	/** Additional free-text fields to extract from the LLM response (from llmEvalConfig) */
	additionalFields?: AdditionalFieldConfig[];
}

/**
 * Evaluator interface
 * Defines the contract for all evaluator implementations
 * @legacy
 * @alpha
 */
export interface IEvaluator {
	evaluate(context: EvaluationContext): Promise<EvaluationResult[]>;
}
