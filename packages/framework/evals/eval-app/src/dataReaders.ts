/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "node:fs";
import * as path from "node:path";

/** Find the scenario subdirectory name within a run directory (the one containing llmEvalConfig.json). */
export function findScenarioDirName(runDir: string): string | undefined {
	if (!fs.existsSync(runDir)) {
		return undefined;
	}
	try {
		for (const d of fs.readdirSync(runDir)) {
			const dirPath = path.join(runDir, d);
			if (
				fs.statSync(dirPath).isDirectory() &&
				fs.existsSync(path.join(dirPath, "llmEvalConfig.json"))
			) {
				return d;
			}
		}
	} catch {
		// Ignore
	}
	return undefined;
}

/** Read dataset summaries from a run directory by finding the scenario subdir and iterating its dataset subdirectories. */
export function readDatasetSummaries(
	runDir: string,
): { datasetName: string; dirName: string; markdown: string }[] {
	if (!fs.existsSync(runDir)) {
		return [];
	}

	const scenarioDirName = findScenarioDirName(runDir);

	// Flat layout: llmEvalConfig.json at root means runDir IS the scenario dir
	// Nested layout: scenarioDirName points to the scenario subdirectory
	const isFlat = !scenarioDirName && fs.existsSync(path.join(runDir, "llmEvalConfig.json"));
	if (!scenarioDirName && !isFlat) {
		return [];
	}

	const scenarioDir = scenarioDirName ? path.join(runDir, scenarioDirName) : runDir;

	let entries: string[];
	try {
		entries = fs.readdirSync(scenarioDir);
	} catch {
		return [];
	}

	return entries
		.filter((d) => {
			const dirPath = path.join(scenarioDir, d);
			try {
				return (
					fs.statSync(dirPath).isDirectory() &&
					fs.existsSync(path.join(dirPath, "summary.md")) &&
					!fs.existsSync(path.join(dirPath, "llmEvalConfig.json"))
				);
			} catch {
				return false;
			}
		})
		.map((d) => {
			const dirPath = path.join(scenarioDir, d);
			const summaryPath = path.join(dirPath, "summary.md");
			let datasetName = d;
			try {
				const resultFile = path.join(dirPath, "result.json");
				if (fs.existsSync(resultFile)) {
					const result = JSON.parse(fs.readFileSync(resultFile, "utf8"));
					if (typeof result.name === "string") {
						datasetName = result.name;
					}
				}
			} catch {
				// Fall back to directory name
			}
			try {
				const markdown = fs.readFileSync(summaryPath, "utf8");
				return { datasetName, dirName: d, markdown };
			} catch {
				return { datasetName, dirName: d, markdown: "" };
			}
		});
}

export interface RunInfo {
	name: string;
	resultPath: string;
	scenarioName: string;
	timestamp: string;
	datasets: string[];
	averageScore: number | undefined;
	generatorModel: string;
	judgeModel: string;
	customResultProperties?: Record<string, boolean | string | number>;
	runType?: "eval" | "manual";
}

/**
 * Parse an ISO-like timestamp from a scenario directory name.
 * Directory names look like: scenario-simple-chat-to-board-2026-03-19T23-47-50-776Z
 */
export function parseTimestampFromDirName(dirName: string): string {
	const match = /(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d+Z)$/.exec(dirName);
	if (match) {
		return `${match[1]}:${match[2]}:${match[3]}.${match[4]}`;
	}
	return "";
}

export function listRuns(resultsDir: string): RunInfo[] {
	if (!fs.existsSync(resultsDir)) {
		return [];
	}
	return fs
		.readdirSync(resultsDir)
		.filter((d) => {
			const dirPath = path.join(resultsDir, d);
			try {
				return fs.statSync(dirPath).isDirectory();
			} catch {
				return false;
			}
		})
		.sort()
		.reverse()
		.map((d): RunInfo | undefined => {
			const runDir = path.join(resultsDir, d);
			let scenarioName = d;
			let timestamp = "";
			let datasets: string[] = [];
			let averageScore: number | undefined;
			let generatorModel = "";
			let judgeModel = "";
			let customResultProperties: Record<string, boolean | string | number> | undefined;

			// Find the scenario results dir. Two layouts:
			// Flat: llmEvalConfig.json at root of runDir (runDir IS the scenario dir)
			// Nested: llmEvalConfig.json in a subdirectory
			let scenarioResultDir: string | undefined;
			const isFlat = fs.existsSync(path.join(runDir, "llmEvalConfig.json"));
			if (isFlat) {
				scenarioResultDir = runDir;
			} else {
				try {
					for (const sub of fs.readdirSync(runDir)) {
						const subPath = path.join(runDir, sub);
						if (
							fs.statSync(subPath).isDirectory() &&
							fs.existsSync(path.join(subPath, "llmEvalConfig.json"))
						) {
							scenarioResultDir = subPath;
							break;
						}
					}
				} catch {
					// Ignore
				}
			}

			// If no scenario results dir found, this isn't a valid run directory
			if (!scenarioResultDir) {
				return undefined;
			}

			const resultPath = isFlat
				? `/api/results/${d}/result.json`
				: `/api/results/${d}/${path.basename(scenarioResultDir)}/result.json`;

			// Try reading scenario-level result.json
			try {
				const resultFile = path.join(scenarioResultDir, "result.json");
				if (fs.existsSync(resultFile)) {
					const result = JSON.parse(fs.readFileSync(resultFile, "utf8"));
					scenarioName = result.name ?? scenarioName;
					judgeModel = result.result?.judgeModel ?? "";
					generatorModel = result.result?.generatorModel ?? "";
					averageScore = result.result?.averageScore;
					timestamp = result.result?.timestamp ?? "";
					customResultProperties = result.customResultProperties;
				}
			} catch {
				// Fall back to defaults
			}

			// Extract dataset names from subdirectories that have summary.md
			try {
				datasets = fs.readdirSync(scenarioResultDir).filter((sub) => {
					const subPath = path.join(scenarioResultDir, sub);
					return (
						fs.statSync(subPath).isDirectory() &&
						fs.existsSync(path.join(subPath, "summary.md")) &&
						!fs.existsSync(path.join(subPath, "llmEvalConfig.json"))
					);
				});
			} catch {
				// Ignore
			}

			// If missing fields, try reading from a dataset-level result.json
			if (!timestamp || !judgeModel) {
				for (const dsName of datasets) {
					try {
						const dsResultFile = path.join(scenarioResultDir, dsName, "result.json");
						if (fs.existsSync(dsResultFile)) {
							const dsResult = JSON.parse(fs.readFileSync(dsResultFile, "utf8"));
							if (!timestamp && dsResult.resultMetadata?.timestamp) {
								timestamp = dsResult.resultMetadata.timestamp;
							}
							if (!judgeModel && dsResult.resultMetadata?.judgeModel) {
								judgeModel = dsResult.resultMetadata.judgeModel;
							}
							if (!generatorModel && dsResult.resultMetadata?.generatorModel) {
								generatorModel = dsResult.resultMetadata.generatorModel;
							}
							if (
								averageScore === undefined &&
								dsResult.resultMetadata?.averageScore !== undefined
							) {
								averageScore = dsResult.resultMetadata.averageScore;
							}
							break; // One dataset is enough for metadata
						}
					} catch {
						// Ignore
					}
				}
			}

			// Last resort: parse timestamp from directory name
			if (!timestamp) {
				timestamp = parseTimestampFromDirName(d);
			}

			return {
				name: d,
				resultPath,
				scenarioName,
				timestamp,
				datasets,
				averageScore,
				generatorModel,
				judgeModel,
				customResultProperties,
			};
		})
		.filter((run): run is RunInfo => run !== undefined)
		.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
}

/**
 * List manual runs stored under \{resultsDir\}/manual/.
 * Each run directory contains result.json, llmEvalConfig.json, summary.md,
 * and dataset-* subdirectories — the same structure as eval runs.
 */
export function listManualRuns(resultsDir: string): RunInfo[] {
	const manualDir = path.join(resultsDir, "manual");
	if (!fs.existsSync(manualDir)) {
		return [];
	}
	return fs
		.readdirSync(manualDir)
		.filter((d) => {
			try {
				return fs.statSync(path.join(manualDir, d)).isDirectory();
			} catch {
				return false;
			}
		})
		.map((d): RunInfo | undefined => {
			const runDir = path.join(manualDir, d);
			let scenarioName = d;
			let timestamp = "";
			let datasets: string[] = [];
			let averageScore: number | undefined;
			let generatorModel = "";
			let customResultProperties: Record<string, boolean | string | number> | undefined;

			try {
				const resultFile = path.join(runDir, "result.json");
				if (!fs.existsSync(resultFile)) return undefined;

				const resultData = JSON.parse(fs.readFileSync(resultFile, "utf8"));
				scenarioName = resultData.name ?? scenarioName;
				generatorModel = resultData.result?.generatorModel ?? "";
				customResultProperties = resultData.customResultProperties;
				averageScore = resultData.result?.averageScore;
				timestamp = resultData.result?.timestamp ?? parseTimestampFromDirName(d);

				// Collect dataset names from dataset subdirectories
				datasets = fs
					.readdirSync(runDir)
					.filter(
						(e) => e.startsWith("dataset-") && fs.statSync(path.join(runDir, e)).isDirectory(),
					)
					.sort()
					.flatMap((dirName) => {
						try {
							const dsResult = JSON.parse(
								fs.readFileSync(path.join(runDir, dirName, "result.json"), "utf8"),
							);
							return dsResult.name ? [dsResult.name as string] : [];
						} catch {
							return [];
						}
					});
			} catch {
				return undefined;
			}

			return {
				name: d,
				resultPath: "",
				scenarioName,
				timestamp,
				datasets,
				averageScore,
				generatorModel,
				judgeModel: "Human",
				customResultProperties,
				runType: "manual",
			};
		})
		.filter((r): r is RunInfo => r !== undefined)
		.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
}

/** Read the scenario-level summary.md. */
export function readScenarioSummary(resultDirPath: string): string | undefined {
	const directSummary = path.join(resultDirPath, "summary.md");
	if (fs.existsSync(directSummary)) {
		return fs.readFileSync(directSummary, "utf8");
	}

	if (fs.existsSync(resultDirPath)) {
		for (const d of fs.readdirSync(resultDirPath)) {
			const dirPath = path.join(resultDirPath, d);
			try {
				if (
					fs.statSync(dirPath).isDirectory() &&
					fs.existsSync(path.join(dirPath, "llmEvalConfig.json")) &&
					fs.existsSync(path.join(dirPath, "summary.md"))
				) {
					return fs.readFileSync(path.join(dirPath, "summary.md"), "utf8");
				}
			} catch {
				continue;
			}
		}
	}

	return undefined;
}
