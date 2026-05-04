/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Generic types for the eval app server.
 *
 * These interfaces allow any application to configure and run the eval app
 * by providing its own generation logic, auth flow, and configuration.
 */

import type {
	CustomPropertyValueType,
	IEvaluator,
	ILLMClient,
	RunOptions,
} from "@ff-internal/eval-framework";

/**
 * Progress reporter for streaming status updates to the client via SSE.
 * @legacy
 * @alpha
 */
export interface ProgressReporter {
	/** Send a progress message to the client. */
	progress(message: string): void;
	/** Send a warning/stderr-level message to the client. */
	warn(message: string): void;
}

/**
 * Request shape passed to the generation callback.
 * @legacy
 * @alpha
 */
export interface RunGenerationRequest {
	/** Dataset filename (relative to datasetsDir or absolute). */
	dataset: string;
	/** Model identifier for generation. */
	model: string;
	/** Model identifier for LLM-as-judge evaluation. */
	judgeModel: string;
	/**
	 * Selected values for any custom generation properties defined in
	 * {@link EvalServerConfig.customGenerationProperties}.
	 */
	customGenerationProperties?: Record<string, CustomPropertyValueType>;
}

/**
 * Per-dataset info returned after a manual run completes.
 */
export interface ManualDatasetInfo {
	name: string;
	dirName: string;
	imageUrls: string[];
}

/**
 * Payload sent in the SSE 'complete' event for a manual run.
 */
export interface ManualRunCompletePayload {
	runDirName: string;
	scenarioName: string;
	timestamp: string;
	rubrics: { name: string; description: string; optional?: boolean }[];
	datasets: ManualDatasetInfo[];
}

/**
 * Result returned by the generation callback on success.
 * @legacy
 * @alpha
 */
export interface RunGenerationResult extends RunOptions {
	/** LLM client to use for evaluation (LLM-as-judge). */
	llmClient: ILLMClient;
	/** Absolute path to the directory where results are written. This is required for the app. */
	resultsDirPath: string;
	/**
	 * Additional evaluators that run alongside the built-in LlmAsJudgeEvaluator.
	 * Results from all evaluators are concatenated.
	 *
	 * To skip LLM-as-judge for a dataset, set `llmEvalConfig.rubrics` to `[]`.
	 */
	customEvaluators?: IEvaluator[];
}

/**
 * Configuration for {@link createEvalServer}.
 * @legacy
 * @alpha
 *
 * Applications import and call `createEvalServer(config)` to start the eval
 * GUI backed by their own generation logic. The server handles:
 * - Running the app-provided generation callback to produce artifacts
 * - Running the eval framework (LLM-as-judge) on those artifacts
 * - Serving the UI, results, and datasets
 */
export interface EvalServerConfig {
	/** Display name for the app (used in page title and UI header). */
	appName: string;

	/** Absolute path to the directory containing dataset JSON files. */
	datasetsDir: string;

	/** Absolute path to the directory where results are written. */
	resultsDir: string;

	/** Default model for the generator dropdown in the UI. */
	defaultGeneratorModel: string;

	/** Default model for the judge dropdown in the UI. */
	defaultJudgeModel: string;

	/** Available model options for the UI dropdowns. */
	modelOptions: string[];

	/**
	 * Optional: Custom properties that appear as configuration dropdowns in the UI.
	 * Maps each property name to the list of valid values shown in its dropdown.
	 *
	 * The value selected by the user is passed to {@link runGeneration} via
	 * {@link RunGenerationRequest.customGenerationProperties} and is automatically
	 * merged into the scenario's `customResultProperties` so it appears in the
	 * results table with filtering.
	 */
	customGenerationProperties?: Record<string, CustomPropertyValueType[]>;

	/** Port to listen on (default: 8150). */
	port?: number;

	/**
	 * Run artifact generation for the given request.
	 *
	 * The implementation should:
	 * - Generate artifacts and write them to a run directory
	 * - Write an `artifacts.json` manifest in the output directory
	 * - Report progress via the {@link ProgressReporter}
	 * - Respect the {@link AbortSignal} for cancellation
	 * - Return the output directory path on success
	 *
	 * Evaluation is handled by the eval app server after generation completes.
	 */
	runGeneration: (
		request: RunGenerationRequest,
		progress: ProgressReporter,
		signal: AbortSignal,
	) => Promise<RunGenerationResult>;

	/**
	 * Optional: Check whether the user is currently authenticated.
	 * Return `true` if authenticated.
	 *
	 * If not provided, auth UI is hidden and auth is assumed to be valid.
	 */
	checkAuth?: () => Promise<boolean>;

	/**
	 * Optional: Run an interactive authentication flow.
	 * Report progress via the {@link ProgressReporter}.
	 * Should resolve on success or reject on failure.
	 *
	 * If not provided, the auth button is hidden in the UI.
	 */
	runAuth?: (progress: ProgressReporter) => Promise<void>;
}
