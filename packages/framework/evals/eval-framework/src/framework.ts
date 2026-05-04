/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-console -- console logs are intentional */
import type {
	AdditionalFieldConfig,
	DatasetArtifact,
	ImageInput,
	JsonObject,
	Rubric,
	ScenarioArtifact,
	ScoreScale,
} from "./artifactTypes.js";
import { DEFAULT_SCALE } from "./artifactTypes.js";
import type { EvaluationContext, IEvaluator } from "./evaluators/evaluatorTypes.js";
import { LlmAsJudgeEvaluator } from "./evaluators/llmAsJudgeEvaluator.js";
import { formatError } from "./formatError.js";
import type { FrameworkOptions, RunOptions } from "./frameworkTypes.js";
import type { Logger } from "./loggerTypes.js";
import { writeResultsToDirectory } from "./reporter.js";
import type {
	DatasetEvalResultInternal,
	ScenarioEvalResultInternal,
} from "./resultInternalTypes.js";
import type {
	DimensionAggregate,
	EvaluationResult,
	ScenarioEvalResult,
	ScenarioEvalResultMetadata,
	DatasetEvalResult,
} from "./resultTypes.js";

/**
 * Main Evaluation Framework
 *
 * Evaluates in-memory ScenarioArtifacts against configured evaluators.
 * The framework does not read input files — all data is provided inline.
 * Use `resultsDirPath` to write results to disk.
 * @legacy
 * @alpha
 */
export class EvalFramework {
	readonly #judgeModel: string;
	readonly #logger: Logger;
	readonly #evaluators: IEvaluator[];
	readonly #concurrency: number;

	constructor(options: FrameworkOptions) {
		this.#judgeModel = options.judgeModel;
		this.#logger = options.logger;
		this.#evaluators = [
			new LlmAsJudgeEvaluator(options.llmClient),
			...(options.customEvaluators ?? []),
		];
		this.#concurrency = Math.max(1, Math.floor(options.concurrency ?? 1));
	}

	/**
	 * Run evaluation on a scenario.
	 * Provide `resultsDirPath` to write results to disk.
	 */
	async run(options: RunOptions): Promise<ScenarioEvalResult> {
		const { scenario } = options;

		// Validate no duplicate dataset names (they map to directory names)
		const seen = new Set<string>();
		for (const ds of scenario.datasetArtifacts) {
			if (seen.has(ds.name)) {
				throw new Error(`Duplicate dataset name "${ds.name}" in scenario "${scenario.name}"`);
			}
			seen.add(ds.name);
		}

		console.log("--- Evaluation ---");
		console.log(`Scenario: ${scenario.name}`);
		console.log(`Datasets: ${scenario.datasetArtifacts.length}`);
		console.log(`Judge model: ${this.#judgeModel}`);
		console.log(`Concurrency: ${this.#concurrency}`);
		console.log("");

		const result = await this.#runScenario(scenario);

		if (options.resultsDirPath !== undefined) {
			const scenarioDir = writeResultsToDirectory(
				result,
				options.resultsDirPath,
				this.#logger,
			);
			result.resultDirPath = scenarioDir;
			console.log(`\nFull results: ${options.resultsDirPath}`);
		}

		// Print summary
		console.log("\n--- Results ---");
		console.log(`Judge model: ${this.#judgeModel}`);
		console.log(JSON.stringify(result.resultMetadata, undefined, 2));

		return cleanInternalProperties(result);
	}

	/**
	 * Run multiple scenarios in parallel and return all results.
	 */
	async runMultiple(optionsList: RunOptions[]): Promise<ScenarioEvalResult[]> {
		return Promise.all(optionsList.map(async (opts) => this.run(opts)));
	}

	// --------------------------------------------------------------------------
	// Scenario Execution
	// --------------------------------------------------------------------------

	async #runScenario(scenario: ScenarioArtifact): Promise<ScenarioEvalResultInternal> {
		const startTime = Date.now();
		const { llmEvalConfig } = scenario;

		const timestamp = new Date().toISOString();
		const datasetResults = await this.#evaluateWithConcurrency(
			scenario.datasetArtifacts,
			llmEvalConfig,
			scenario,
			timestamp,
		);

		const totalTime = Date.now() - startTime;

		// Calculate per-dataset averages
		const allScores = datasetResults.map((dr) => this.#calculateAggregateScore(dr.evalResult));
		const averageScore =
			allScores.length > 0 ? allScores.reduce((sum, s) => sum + s, 0) / allScores.length : 0;

		// Calculate per-dimension aggregates across all datasets
		const scaleMax = llmEvalConfig.defaultScale?.max ?? DEFAULT_SCALE.max;
		const { rubricDimensionAggregates, totalPoints, maxPossiblePoints } =
			this.#computeRubricDimensionAggregates(datasetResults, llmEvalConfig.rubrics, scaleMax);
		const overallPercentage =
			maxPossiblePoints > 0 ? Math.round((totalPoints / maxPossiblePoints) * 10000) / 100 : 0;
		const goodThreshold = scenario.llmEvalConfig.statusThresholds?.good ?? 80;
		const passThreshold = scenario.llmEvalConfig.statusThresholds?.pass ?? 60;
		const status =
			overallPercentage >= goodThreshold
				? "GOOD"
				: overallPercentage >= passThreshold
					? "PASS"
					: "NEEDS_IMPROVEMENT";

		const resultMetadata: ScenarioEvalResultMetadata = {
			totalDatasets: datasetResults.length,
			averageScore,
			totalExecutionTimeMs: totalTime,
			generatorModel: scenario.modelType,
			judgeModel: this.#judgeModel,
			timestamp,
			rubricDimensionAggregates,
			totalPoints,
			maxPossiblePoints,
			overallPercentage,
			status,
		};

		const result: ScenarioEvalResultInternal = {
			llmEvalConfig: scenario.llmEvalConfig,
			name: scenario.name,
			appMetadata: scenario.metadata,
			customResultProperties: scenario.customResultProperties,
			datasetResults,
			resultMetadata,
		};

		this.#logger.info(
			`Evaluation complete: ${datasetResults.length} datasets, avg score ${averageScore.toFixed(2)}, ${overallPercentage}% (${status})`,
		);

		return result;
	}

	// --------------------------------------------------------------------------
	// Concurrent Evaluation
	// --------------------------------------------------------------------------

	/**
	 * Evaluate datasets with bounded concurrency using a worker pool pattern.
	 * Workers grab the next available dataset via a shared counter, preserving result order.
	 */
	async #evaluateWithConcurrency(
		artifacts: DatasetArtifact[],
		llmEvalConfig: ScenarioArtifact["llmEvalConfig"],
		scenario: ScenarioArtifact,
		timestamp: string,
	): Promise<DatasetEvalResultInternal[]> {
		const results: DatasetEvalResultInternal[] = Array.from({ length: artifacts.length });
		let nextIndex = 0;

		const worker = async (): Promise<void> => {
			while (nextIndex < artifacts.length) {
				const i = nextIndex++;
				results[i] = await this.#evaluateDataset(
					artifacts[i],
					llmEvalConfig,
					scenario,
					timestamp,
				);
			}
		};

		const workerCount = Math.min(this.#concurrency, artifacts.length);
		await Promise.all(Array.from({ length: workerCount }, async () => worker()));

		return results;
	}

	/**
	 * Evaluate a single dataset artifact. Returns an error result on failure
	 * instead of throwing, so other concurrent datasets can continue.
	 */
	async #evaluateDataset(
		artifact: DatasetArtifact,
		llmEvalConfig: ScenarioArtifact["llmEvalConfig"],
		scenario: ScenarioArtifact,
		timestamp: string,
	): Promise<DatasetEvalResultInternal> {
		const datasetStartTime = Date.now();
		try {
			const evaluationResults = await this.#runEvaluator(
				artifact.input,
				artifact.output,
				artifact.metadata,
				llmEvalConfig.rubrics,
				artifact.images,
				llmEvalConfig.dataInterpretationPrompt,
				llmEvalConfig.defaultScale,
				llmEvalConfig.additionalFields,
			);

			return {
				name: artifact.name,
				appMetadata: artifact.metadata,
				evalResult: evaluationResults,
				input: artifact.input,
				output: artifact.output,
				images: artifact.images,
				resultMetadata: {
					averageScore: this.#calculateAggregateScore(evaluationResults),
					executionTimeMs: Date.now() - datasetStartTime,
					timestamp,
					generatorModel: scenario.modelType,
					judgeModel: this.#judgeModel,
				},
			};
		} catch (error) {
			this.#logger.error(`Failed to evaluate dataset ${artifact.name}: ${formatError(error)}`);

			return {
				name: artifact.name,
				appMetadata: artifact.metadata,
				evalResult: [],
				input: artifact.input,
				output: artifact.output,
				images: artifact.images,
				resultMetadata: {
					averageScore: 0,
					executionTimeMs: Date.now() - datasetStartTime,
					timestamp,
					generatorModel: scenario.modelType,
					judgeModel: this.#judgeModel,
				},
			};
		}
	}

	// --------------------------------------------------------------------------
	// Evaluator
	// --------------------------------------------------------------------------

	async #runEvaluator(
		input: JsonObject | undefined,
		output: JsonObject,
		metadata: JsonObject,
		rubrics: Rubric[],
		images?: ImageInput[],
		dataInterpretationPrompt?: string,
		defaultScale?: ScoreScale,
		additionalFields?: AdditionalFieldConfig[],
	): Promise<EvaluationResult[]> {
		const context: EvaluationContext = {
			input,
			output,
			metadata,
			images,
			rubrics,
			defaultScale,
			dataInterpretationPrompt,
			additionalFields,
			judgeModel: this.#judgeModel,
			logger: this.#logger,
		};

		const results: EvaluationResult[] = [];
		for (const evaluator of this.#evaluators) {
			try {
				results.push(...(await evaluator.evaluate(context)));
			} catch (error) {
				this.#logger.error(`Evaluator failed: ${formatError(error)}`);
			}
		}
		return results;
	}

	// --------------------------------------------------------------------------
	// Aggregation
	// --------------------------------------------------------------------------

	/**
	 * Calculate weighted aggregate score from evaluation results.
	 * Skips undefined scores (from optional N/A rubrics).
	 */
	#calculateAggregateScore(results: EvaluationResult[]): number {
		const scored = results.filter((r) => r.score !== undefined);
		if (scored.length === 0) {
			return 0;
		}

		let totalScore = 0;
		for (const result of scored) {
			totalScore += result.score as number;
		}
		return totalScore / scored.length;
	}

	/**
	 * Compute per-dimension aggregate statistics across all datasets.
	 * Returns dimension-level avg/min/max/count plus total points for percentage calculation.
	 *
	 * Aggregates dimensions from two sources:
	 * 1. Declared rubrics (from llmEvalConfig) — scored by LlmAsJudgeEvaluator
	 * 2. Discovered dimensions — any result rubricName not matching a declared rubric
	 * (e.g., from custom evaluators like content safety or deterministic checks)
	 */
	#computeRubricDimensionAggregates(
		datasetResults: DatasetEvalResult[],
		rubrics: Rubric[],
		scaleMax: number,
	): {
		rubricDimensionAggregates: Record<string, DimensionAggregate>;
		totalPoints: number;
		maxPossiblePoints: number;
	} {
		const rubricDimensionAggregates: Record<string, DimensionAggregate> = {};
		let totalPoints = 0;
		let maxPossiblePoints = 0;

		// Collect all unique dimension names from results
		const rubricNames = new Set(rubrics.map((r) => r.name));
		const discoveredDimensions = new Set<string>();
		for (const dataset of datasetResults) {
			for (const result of dataset.evalResult) {
				if (!rubricNames.has(result.rubricName)) {
					discoveredDimensions.add(result.rubricName);
				}
			}
		}

		// Helper to aggregate a single dimension
		const aggregateDimension = (name: string, dimScaleMax: number): void => {
			const scores: number[] = [];
			for (const dataset of datasetResults) {
				const evalResult = dataset.evalResult.find((r) => r.rubricName === name);
				if (evalResult?.score !== undefined) {
					scores.push(evalResult.score);
				}
			}

			if (scores.length > 0) {
				const sum = scores.reduce((a, b) => a + b, 0);
				rubricDimensionAggregates[name] = {
					average: sum / scores.length,
					count: scores.length,
					min: Math.min(...scores),
					max: Math.max(...scores),
				};
				totalPoints += sum;
				maxPossiblePoints += scores.length * dimScaleMax;
			} else {
				rubricDimensionAggregates[name] = {
					average: undefined,
					count: 0,
					min: undefined,
					max: undefined,
				};
			}
		};

		// 1. Aggregate declared rubric dimensions (use scenario's defaultScale)
		for (const rubric of rubrics) {
			aggregateDimension(rubric.name, scaleMax);
		}

		// 2. Aggregate discovered dimensions from custom evaluators (use same defaultScale)
		for (const name of discoveredDimensions) {
			aggregateDimension(name, scaleMax);
		}

		return { rubricDimensionAggregates, totalPoints, maxPossiblePoints };
	}
}

function cleanInternalProperties(result: ScenarioEvalResultInternal): ScenarioEvalResult {
	const { llmEvalConfig, datasetResults, ...rest } = result;
	return {
		...rest,
		datasetResults: datasetResults.map(({ input, output, images, ...ds }) => ds),
	};
}
