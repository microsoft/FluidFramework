/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ScenarioArtifact } from "./artifactTypes.js";
import type { IEvaluator } from "./evaluators/evaluatorTypes.js";
import type { ILLMClient } from "./llmTypes.js";
import type { Logger } from "./loggerTypes.js";

/**
 * Options for framework initialization
 * @legacy
 * @alpha
 */
export interface FrameworkOptions {
	logger: Logger;
	judgeModel: string;
	llmClient: ILLMClient;
	/** Maximum number of datasets to evaluate in parallel (default: 1 = sequential). */
	concurrency?: number;
	/**
	 * Additional evaluators that run alongside the built-in LlmAsJudgeEvaluator.
	 * Results from all evaluators are concatenated.
	 *
	 * The LLM-as-judge evaluator always runs first. To skip it for a specific
	 * dataset, set `llmEvalConfig.rubrics` to an empty array — the LLM evaluator
	 * will return no results and only the custom evaluators will produce scores.
	 */
	customEvaluators?: IEvaluator[];
}

/**
 * Options for the run() method.
 * @legacy
 * @alpha
 */
export interface RunOptions {
	/** The scenario to evaluate. */
	scenario: ScenarioArtifact;
	/** Directory to write result files to. If omitted, no results are written to disk. */
	resultsDirPath?: string;
}
