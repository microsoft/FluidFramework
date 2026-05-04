/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type { CustomPropertyValueType, LlmEvalConfig, ScoreScale } from "./artifactTypes.js";
import { DEFAULT_SCALE } from "./artifactTypes.js";
import type { Logger } from "./loggerTypes.js";
import type {
	DatasetEvalResultInternal,
	ScenarioEvalResultInternal,
} from "./resultInternalTypes.js";
import type {
	EvaluationResult,
	ScenarioEvalResult,
	ScenarioEvalResultMetadata,
} from "./resultTypes.js";

const appInputFileName = "appInput.json";
const appOutputFileName = "appOutput.json";
const resultFileName = "result.json";
const llmEvalConfigFileName = "llmEvalConfig.json";
const summaryFileName = "summary.md";

/**
 * Format an ISO timestamp to a human-readable date/time string.
 */
function formatTimestamp(iso: string): string {
	try {
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) {
			return iso;
		}
		return `${d.toLocaleString("en-US", {
			timeZone: "UTC",
			month: "short",
			day: "numeric",
			year: "numeric",
			hour: "numeric",
			minute: "2-digit",
			hour12: true,
		})} UTC`;
	} catch {
		return iso;
	}
}

/**
 * Format a duration in milliseconds to a human-readable string.
 */
function formatDuration(ms: number): string {
	if (ms < 1000) {
		return `${ms}ms`;
	}
	const seconds = ms / 1000;
	if (seconds < 60) {
		return `${seconds.toFixed(1)}s`;
	}
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
}

/**
 * Convert an evaluator/dimension name to a human-readable display name.
 */
function formatEvaluatorDisplayName(name: string): string {
	return name
		.replace(/^llm-/, "")
		.replace(/-/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Convert a name to a kebab-case slug safe for use in folder names and markdown links.
 * e.g., "simple chat to board" → "simple-chat-to-board"
 */
function toKebabSlug(name: string): string {
	return name
		.trim()
		.toLowerCase()
		.replace(/[^\da-z]+/g, "-")
		.replace(/^-|-$/g, "");
}

export function getDatasetDirectoryName(datasetName: string): string {
	return `dataset-${toKebabSlug(datasetName)}`;
}

export function getScenarioDirectoryName(scenarioName: string, timestamp: string): string {
	return `scenario-${toKebabSlug(scenarioName)}-${timestamp.replace(/:/g, "-")}`;
}

/**
 * Generate a markdown summary for a scenario-level result.
 */
export function generateScenarioSummaryMarkdown(result: ScenarioEvalResult): string {
	const lines: string[] = [];
	const { resultMetadata } = result;

	lines.push(`# Scenario: ${result.name}`);
	lines.push("");
	lines.push("| Field | Value |");
	lines.push("|-------|-------|");
	lines.push(
		`| <abbr title="When this scenario evaluation was run">**Time**</abbr> | ${formatTimestamp(resultMetadata.timestamp)} |`,
	);
	lines.push(
		`| <abbr title="Mean of rubric scores across all datasets">**Average Score**</abbr> | ${resultMetadata.averageScore.toFixed(2)} |`,
	);
	lines.push(
		`| <abbr title="Total points / max possible points. Status: GOOD (≥80%), PASS (≥60%), NEEDS_IMPROVEMENT (&lt;60%)">**Grade**</abbr> | ${resultMetadata.overallPercentage}% (${resultMetadata.status}) |`,
	);
	lines.push(
		`| <abbr title="Model used to generate application output">**Generator Model**</abbr> | ${resultMetadata.generatorModel} |`,
	);
	lines.push(
		`| <abbr title="Model used to judge application output">**Judge Model**</abbr> | ${resultMetadata.judgeModel} |`,
	);
	if (result.customResultProperties) {
		for (const [key, value] of Object.entries(result.customResultProperties)) {
			lines.push(`| **${key}** | ${String(value)} |`);
		}
	}
	lines.push("");

	lines.push("<details open>");
	lines.push("<summary>Additional details</summary>");
	lines.push("");

	// Rubric dimension aggregates
	const dimensions = Object.entries(resultMetadata.rubricDimensionAggregates);
	if (dimensions.length > 0) {
		lines.push("**Rubric Dimension Averages**");
		lines.push("");
		lines.push("| Dimension | Avg Score |");
		lines.push("|-----------|-----------|");
		for (const [name, agg] of dimensions) {
			const avgText = agg.average === undefined ? "N/A" : agg.average.toFixed(2);
			lines.push(`| ${formatEvaluatorDisplayName(name)} | ${avgText} |`);
		}
		lines.push("");
	}

	lines.push(`**Evaluation config:** [${llmEvalConfigFileName}](${llmEvalConfigFileName})`);
	lines.push("");
	lines.push(`**Detailed result:** [${resultFileName}](${resultFileName})`);
	lines.push("");
	lines.push("</details>");
	lines.push("");

	// Per-dataset summary table
	if (result.datasetResults.length > 0) {
		lines.push(`## Dataset Results (${resultMetadata.totalDatasets})`);
		lines.push("");
		lines.push("| Dataset | Avg Score | Duration |");
		lines.push("|---------|-----------|----------|");

		for (const ds of result.datasetResults) {
			if (ds.resultDirPath === undefined) {
				throw new Error(`Dataset result for "${ds.name}" is missing resultDirPath`);
			}
			const avgScore =
				ds.evalResult.length > 0
					? (
							ds.evalResult
								.filter((r) => r.score !== undefined)
								.reduce((sum, r) => sum + (r.score as number), 0) /
								ds.evalResult.filter((r) => r.score !== undefined).length || 0
						).toFixed(2)
					: "N/A";
			lines.push(
				`| [${ds.name}](${path.basename(ds.resultDirPath)}/summary.md) | ${avgScore} | ${formatDuration(ds.resultMetadata.executionTimeMs)} |`,
			);
		}
		lines.push("");
	}

	return lines.join("\n");
}

/**
 * Generate a markdown summary for a single dataset result.
 */
export function generateDatasetSummaryMarkdown(
	datasetResult: DatasetEvalResultInternal,
	imagePathNames: string[],
): string {
	const lines: string[] = [];

	lines.push(`# Dataset: ${datasetResult.name}`);
	lines.push("");

	// Metadata table
	lines.push("| Field | Value |");
	lines.push("|-------|-------|");
	lines.push(
		`| <abbr title="When this dataset evaluation was run">**Time**</abbr> | ${formatTimestamp(datasetResult.resultMetadata.timestamp)} |`,
	);
	lines.push(
		`| <abbr title="Mean of rubric scores for this dataset">**Average Score**</abbr> | ${datasetResult.resultMetadata.averageScore.toFixed(2)} |`,
	);
	lines.push("");

	lines.push("<details open>");
	lines.push("<summary>Additional details</summary>");
	lines.push("");

	// Evaluation results
	if (datasetResult.evalResult.length > 0) {
		lines.push("**Evaluation Results**");
		lines.push("");
		lines.push("| Rubric | Score | Reasoning |");
		lines.push("|-------|-------|-----------|");

		for (const evaluation of datasetResult.evalResult) {
			const displayName = formatEvaluatorDisplayName(evaluation.rubricName);
			const scoreText = evaluation.score === undefined ? "N/A" : evaluation.score.toFixed(2);
			const sanitizedReasoning = evaluation.reasoning
				.replace(/\|/g, "\\|")
				.replace(/\n/g, "<br/>");
			lines.push(`| ${displayName} | ${scoreText} | ${sanitizedReasoning} |`);
		}
		lines.push("");
	}

	// Input section
	if (datasetResult.input) {
		lines.push(`**Application Input:** [${appInputFileName}](${appInputFileName})`);
	}
	lines.push(`**Application Output:** [${appOutputFileName}](${appOutputFileName})`);

	// Output section

	lines.push(`**Detailed result:** [${resultFileName}](${resultFileName})`);
	lines.push("");
	lines.push("</details>");
	lines.push("");

	if (imagePathNames.length > 0) {
		lines.push("<details open>");
		lines.push("<summary>Images</summary>");
		lines.push("");
		lines.push("**Images**");
		lines.push("");
		for (const imagePath of imagePathNames) {
			const encodedUrl = encodeURI(imagePath);
			const escapedAltText = imagePath.replace(/]/g, "\\]");
			lines.push(`![${escapedAltText}](${encodedUrl})`);
			lines.push("");
		}
		lines.push("");
		lines.push("</details>");
		lines.push("");
	}

	return lines.join("\n");
}

/**
 * Write eval results to a structured output directory.
 * Creates:
 * \{outputDir\}/\{scenarioName-timestamp\}/
 * llmEvalConfig.json, result.json, summary.md,
 * \{datasetName-timestamp\}/
 * appInput.json, appOutput.json, images, result.json, summary.md
 * @returns The path to the scenario directory.
 */
export function writeResultsToDirectory(
	result: ScenarioEvalResultInternal,
	outputDir: string,
	logger: Logger,
): string {
	fs.mkdirSync(outputDir, { recursive: true });
	logger.info(`Writing results to: ${outputDir}`);

	// Write scenario-level result.json
	const scenarioResult = {
		name: result.name,
		appMetadata: result.appMetadata,
		customResultProperties: result.customResultProperties,
		result: result.resultMetadata,
	};
	const scenarioDirName = getScenarioDirectoryName(
		result.name,
		result.resultMetadata.timestamp,
	);
	const scenarioDir = path.join(outputDir, scenarioDirName);
	fs.mkdirSync(scenarioDir, { recursive: true });

	for (const datasetResult of result.datasetResults) {
		const datasetDirName = getDatasetDirectoryName(datasetResult.name);
		const datasetDir = path.join(scenarioDir, datasetDirName);
		fs.mkdirSync(datasetDir, { recursive: true });

		if (datasetResult.input !== undefined) {
			fs.writeFileSync(
				path.join(datasetDir, appInputFileName),
				JSON.stringify(datasetResult.input, undefined, 2),
			);
		}
		fs.writeFileSync(
			path.join(datasetDir, appOutputFileName),
			JSON.stringify(datasetResult.output, undefined, 2),
		);
		const imageFileNamesForSummary: string[] = [];
		if (datasetResult.images !== undefined && datasetResult.images.length > 0) {
			for (const [index, image] of datasetResult.images.entries()) {
				if (typeof image === "string") {
					const fileName = path.basename(image);
					imageFileNamesForSummary.push(fileName);
					fs.copyFileSync(image, path.join(datasetDir, fileName));
				} else {
					const fileName = `image${index}.png`;
					imageFileNamesForSummary.push(fileName);
					fs.writeFileSync(path.join(datasetDir, fileName), image.data);
				}
			}
		}

		// Write result.json
		fs.writeFileSync(
			path.join(datasetDir, resultFileName),
			JSON.stringify(datasetResult, undefined, 2),
		);
		datasetResult.resultDirPath = datasetDir;

		// Write summary.md
		const summaryMarkdown = generateDatasetSummaryMarkdown(
			datasetResult,
			imageFileNamesForSummary,
		);
		fs.writeFileSync(path.join(datasetDir, summaryFileName), summaryMarkdown);
	}

	fs.writeFileSync(
		path.join(scenarioDir, llmEvalConfigFileName),
		JSON.stringify(result.llmEvalConfig, undefined, 2),
	);
	fs.writeFileSync(
		path.join(scenarioDir, resultFileName),
		JSON.stringify(scenarioResult, undefined, 2),
	);
	// Write scenario-level summary.md
	const scenarioSummary = generateScenarioSummaryMarkdown(result);
	fs.writeFileSync(path.join(scenarioDir, summaryFileName), scenarioSummary);

	logger.debug(`Wrote ${result.datasetResults.length} dataset directories`);

	return scenarioDir;
}

/**
 * Update `result.json` and `summary.md` in an existing manual run directory with new human scores.
 * Reads rubric config from `llmEvalConfig.json` and existing metadata from `result.json`.
 * Only rewrites result/summary files — does not touch appInput, appOutput, or images.
 */
export function updateManualResultFiles(
	runDir: string,
	scores: Record<string, Record<string, { score: number | undefined; reasoning: string }>>,
): void {
	const scenarioResultJson = JSON.parse(
		fs.readFileSync(path.join(runDir, resultFileName), "utf8"),
	) as {
		name: string;
		appMetadata: Record<string, unknown>;
		customResultProperties: Record<string, CustomPropertyValueType> | undefined;
		result: ScenarioEvalResultMetadata;
	};
	const llmEvalConfig = JSON.parse(
		fs.readFileSync(path.join(runDir, llmEvalConfigFileName), "utf8"),
	) as LlmEvalConfig;
	const rubrics = llmEvalConfig.rubrics;
	const scale: ScoreScale = llmEvalConfig.defaultScale ?? DEFAULT_SCALE;
	const { timestamp, generatorModel } = scenarioResultJson.result;
	const judgeModel = "Human";

	// Process each dataset directory
	const datasetResults: DatasetEvalResultInternal[] = [];
	const datasetDirs = fs
		.readdirSync(runDir)
		.filter((d) => d.startsWith("dataset-") && fs.statSync(path.join(runDir, d)).isDirectory())
		.sort();

	for (const dirName of datasetDirs) {
		const datasetDir = path.join(runDir, dirName);
		const existingDs = JSON.parse(
			fs.readFileSync(path.join(datasetDir, resultFileName), "utf8"),
		) as DatasetEvalResultInternal;
		const dsScores = scores[existingDs.name] ?? {};

		const evalResult: EvaluationResult[] = rubrics.map((rubric) => {
			const entry: { score: number | undefined; reasoning: string } | undefined =
				dsScores[rubric.name];
			return {
				rubricName: rubric.name,
				score: entry?.score,
				reasoning: entry?.reasoning ?? "",
				executionTimeMs: 0,
			};
		});
		const nonNull = evalResult
			.filter((r) => r.score !== undefined)
			.map((r) => r.score as number);
		const dsAverageScore =
			nonNull.length > 0 ? nonNull.reduce((a, b) => a + b, 0) / nonNull.length : 0;

		const imageFileNames = fs
			.readdirSync(datasetDir)
			.filter((f) => /\.(png|jpg|jpeg|gif|webp)$/i.test(f))
			.sort();

		const dsResult: DatasetEvalResultInternal = {
			...existingDs,
			evalResult,
			resultMetadata: {
				...existingDs.resultMetadata,
				averageScore: dsAverageScore,
				judgeModel,
			},
			resultDirPath: datasetDir,
		};
		fs.writeFileSync(
			path.join(datasetDir, resultFileName),
			JSON.stringify(dsResult, undefined, 2),
		);
		fs.writeFileSync(
			path.join(datasetDir, summaryFileName),
			generateDatasetSummaryMarkdown(dsResult, imageFileNames),
		);
		datasetResults.push(dsResult);
	}

	// Compute scenario-level aggregates
	const allEval = datasetResults.flatMap((ds) => ds.evalResult);
	const rubricDimensionAggregates: ScenarioEvalResultInternal["resultMetadata"]["rubricDimensionAggregates"] =
		{};
	for (const rubric of rubrics) {
		const s = allEval
			.filter((r) => r.rubricName === rubric.name && r.score !== undefined)
			.map((r) => r.score as number);
		rubricDimensionAggregates[rubric.name] = {
			average: s.length > 0 ? s.reduce((a, b) => a + b, 0) / s.length : undefined,
			count: s.length,
			min: s.length > 0 ? Math.min(...s) : undefined,
			max: s.length > 0 ? Math.max(...s) : undefined,
		};
	}
	const allScores = allEval.filter((r) => r.score !== undefined).map((r) => r.score as number);
	const totalPoints = allScores.reduce((a, b) => a + b, 0);
	const maxPossiblePoints = allScores.length * scale.max;
	const overallPercentage =
		maxPossiblePoints > 0 ? Math.round((totalPoints / maxPossiblePoints) * 100) : 0;
	const status: "GOOD" | "PASS" | "NEEDS_IMPROVEMENT" =
		overallPercentage >= 80 ? "GOOD" : overallPercentage >= 60 ? "PASS" : "NEEDS_IMPROVEMENT";
	const averageScore =
		allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0;

	const updatedResultMetadata = {
		...scenarioResultJson.result,
		timestamp,
		generatorModel,
		judgeModel,
		averageScore,
		totalPoints,
		maxPossiblePoints,
		overallPercentage,
		status,
		rubricDimensionAggregates,
	};
	const updatedScenarioResult = { ...scenarioResultJson, result: updatedResultMetadata };
	fs.writeFileSync(
		path.join(runDir, resultFileName),
		JSON.stringify(updatedScenarioResult, undefined, 2),
	);

	// generateScenarioSummaryMarkdown expects a ScenarioEvalResult shape
	const scenarioForMarkdown: ScenarioEvalResult = {
		name: scenarioResultJson.name,
		appMetadata: scenarioResultJson.appMetadata,
		customResultProperties: scenarioResultJson.customResultProperties,
		datasetResults,
		resultMetadata: updatedResultMetadata,
	};
	fs.writeFileSync(
		path.join(runDir, summaryFileName),
		generateScenarioSummaryMarkdown(scenarioForMarkdown),
	);
}
