/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type {
	AdditionalFieldConfig,
	CustomPropertyValueType,
	DatasetArtifact,
	ImageBase64,
	ImageInput,
	JsonObject,
	LlmEvalConfig,
	Rubric,
	ScenarioArtifact,
	ScoreScale,
	StatusThresholds,
} from "./artifactTypes.js";
export type { Logger } from "./loggerTypes.js";
export type {
	ILLMClient,
	ChatMessage,
	LLMResponse,
	TextContent,
	ImageContent,
	ContentBlock,
	ImageMediaType,
} from "./llmTypes.js";
export type {
	ScenarioEvalResult,
	ScenarioEvalResultMetadata,
	DatasetEvalResult,
	DatasetEvalResultMetadata,
	EvaluationResult,
	DimensionAggregate,
} from "./resultTypes.js";
export type { IEvaluator, EvaluationContext } from "./evaluators/evaluatorTypes.js";
export { EvalFramework } from "./framework.js";
export { evalResultAsRecord } from "./resultUtils.js";
export type { RunOptions, FrameworkOptions } from "./frameworkTypes.js";
