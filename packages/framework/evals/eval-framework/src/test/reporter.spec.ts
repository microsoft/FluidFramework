/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { Logger } from "../loggerTypes.js";
import {
	generateDatasetSummaryMarkdown,
	generateScenarioSummaryMarkdown,
	getScenarioDirectoryName,
	updateManualResultFiles,
	writeResultsToDirectory,
} from "../reporter.js";
import type {
	DatasetEvalResultInternal,
	ScenarioEvalResultInternal,
} from "../resultInternalTypes.js";

function createMockDatasetResult(
	overrides?: Partial<DatasetEvalResultInternal>,
): DatasetEvalResultInternal {
	return {
		name: "basic_001",
		appMetadata: {},
		evalResult: [
			{
				rubricName: "overlap",
				score: 5,
				reasoning: "No overlapping pairs detected",
				executionTimeMs: 5,
			},
		],
		resultMetadata: {
			averageScore: 5,
			executionTimeMs: 2100,
			timestamp: "2026-02-17T10:30:45.123Z",
			generatorModel: "gpt-5-chat-mini",
			judgeModel: "gpt-5-chat-mini",
		},
		input: { prompt: "test input" },
		output: { response: "test output" },
		images: undefined,
		...overrides,
	};
}

function createMockScenarioResult(
	overrides?: Partial<ScenarioEvalResultInternal>,
): ScenarioEvalResultInternal {
	return {
		name: "test_scenario",
		appMetadata: {},
		datasetResults: [
			createMockDatasetResult({ resultDirPath: "/output/dataset-basic-001" }),
			createMockDatasetResult({
				name: "edit_001",
				resultDirPath: "/output/dataset-edit-001",
				evalResult: [
					{
						rubricName: "overlap",
						score: 0,
						reasoning: "2 overlapping pairs detected",
						executionTimeMs: 3,
					},
				],
				resultMetadata: {
					averageScore: 0,
					executionTimeMs: 4000,
					timestamp: "2026-02-17T10:30:49.123Z",
					generatorModel: "gpt-5-chat-mini",
					judgeModel: "gpt-5-chat-mini",
				},
			}),
		],
		resultMetadata: {
			totalDatasets: 2,
			averageScore: 2.5,
			totalExecutionTimeMs: 6100,
			generatorModel: "gpt-5-chat-mini",
			judgeModel: "gpt-5-chat-mini",
			timestamp: new Date().toISOString(),
			rubricDimensionAggregates: { overlap: { average: 2.5, count: 2, min: 0, max: 5 } },
			totalPoints: 5,
			maxPossiblePoints: 10,
			overallPercentage: 50,
			status: "NEEDS_IMPROVEMENT",
		},
		llmEvalConfig: {
			rubrics: [{ name: "overlap", description: "Check for overlapping pairs" }],
		},
		...overrides,
	};
}

const mockLogger: Logger = {
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	debug: jest.fn(),
};

describe("reporter", () => {
	describe("generateDatasetSummaryMarkdown", () => {
		it("should include header with dataset name", () => {
			const datasetResult = createMockDatasetResult();
			const md = generateDatasetSummaryMarkdown(datasetResult, []);

			expect(md).toContain("# Dataset: basic_001");
		});

		it("should include metadata table", () => {
			const datasetResult = createMockDatasetResult();
			const md = generateDatasetSummaryMarkdown(datasetResult, []);

			expect(md).toContain("**Average Score**");
			expect(md).toContain("5.00");
		});

		it("should include evaluation results table", () => {
			const datasetResult = createMockDatasetResult();
			const md = generateDatasetSummaryMarkdown(datasetResult, []);

			expect(md).toContain("**Evaluation Results**");
			expect(md).toContain("Overlap");
			expect(md).toContain("5.00");
			expect(md).toContain("No overlapping pairs detected");
		});

		it("should handle N/A scores for optional rubrics", () => {
			const datasetResult = createMockDatasetResult({
				evalResult: [
					{
						rubricName: "optional_dim",
						score: undefined,
						reasoning: "N/A - not applicable",
						executionTimeMs: 2,
					},
				],
			});
			const md = generateDatasetSummaryMarkdown(datasetResult, []);

			expect(md).toContain("N/A");
		});
	});

	describe("generateDatasetSummaryMarkdown - abbr tooltips", () => {
		it("should include abbr tooltips on all metadata fields", () => {
			const md = generateDatasetSummaryMarkdown(createMockDatasetResult(), []);

			expect(md).toContain(
				'<abbr title="When this dataset evaluation was run">**Time**</abbr>',
			);
			expect(md).toContain(
				'<abbr title="Mean of rubric scores for this dataset">**Average Score**</abbr>',
			);
		});
	});

	describe("generateScenarioSummaryMarkdown", () => {
		it("should include abbr tooltips on all metadata fields", () => {
			const result = createMockScenarioResult();
			const md = generateScenarioSummaryMarkdown(result);

			expect(md).toContain(
				'<abbr title="When this scenario evaluation was run">**Time**</abbr>',
			);
			expect(md).toContain(
				'<abbr title="Mean of rubric scores across all datasets">**Average Score**</abbr>',
			);
			expect(md).toContain("**Grade**</abbr>");
			expect(md).toContain(
				'<abbr title="Model used to generate application output">**Generator Model**</abbr>',
			);
			expect(md).toContain(
				'<abbr title="Model used to judge application output">**Judge Model**</abbr>',
			);
		});

		it("should use Grade instead of Overall with percentage and status", () => {
			const result = createMockScenarioResult();
			const md = generateScenarioSummaryMarkdown(result);

			expect(md).toContain("**Grade**");
			expect(md).toContain("50% (NEEDS_IMPROVEMENT)");
			expect(md).not.toContain("**Overall**");
		});

		it("should include rubric dimensions section with average scores", () => {
			const result = createMockScenarioResult();
			const md = generateScenarioSummaryMarkdown(result);

			expect(md).toContain("**Rubric Dimension Averages**");
			expect(md).toContain("| Dimension | Avg Score |");
			expect(md).toContain("| Overlap | 2.50 |");
		});

		it("should omit rubric dimensions section when aggregates are empty", () => {
			const result = createMockScenarioResult({
				resultMetadata: {
					...createMockScenarioResult().resultMetadata,
					rubricDimensionAggregates: {},
				},
			});
			const md = generateScenarioSummaryMarkdown(result);

			expect(md).not.toContain("## Rubric Dimensions");
		});

		it("should handle null average in dimension aggregates", () => {
			const result = createMockScenarioResult({
				resultMetadata: {
					...createMockScenarioResult().resultMetadata,
					rubricDimensionAggregates: {
						accuracy: { average: undefined, count: 0, min: undefined, max: undefined },
					},
				},
			});
			const md = generateScenarioSummaryMarkdown(result);

			expect(md).toContain("| Accuracy | N/A |");
		});

		it("should show total datasets count in Dataset Results section header", () => {
			const result = createMockScenarioResult();
			const md = generateScenarioSummaryMarkdown(result);

			expect(md).toContain("## Dataset Results (2)");
			expect(md).not.toMatch(/\| \*\*Total Datasets\*\*/);
		});

		it("should include per-dataset rows with links to summary.md", () => {
			const result = createMockScenarioResult();
			const md = generateScenarioSummaryMarkdown(result);

			expect(md).toContain("[basic_001](dataset-basic-001/summary.md)");
			expect(md).toContain("[edit_001](dataset-edit-001/summary.md)");
		});
	});

	describe("writeResultsToDirectory", () => {
		let tmpDir: string;

		beforeEach(() => {
			tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eval-reporter-test-"));
		});

		afterEach(() => {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		});

		it("should create dataset directories with result.json and summary.md", () => {
			const result = createMockScenarioResult();
			const outputDir = path.join(tmpDir, "output");
			const scenarioDir = writeResultsToDirectory(result, outputDir, mockLogger);

			// Check dataset directory (nested under scenario directory)
			const datasetDir = path.join(scenarioDir, "dataset-basic-001");
			expect(fs.existsSync(path.join(datasetDir, "result.json"))).toBe(true);
			expect(fs.existsSync(path.join(datasetDir, "summary.md"))).toBe(true);

			const resultJson = JSON.parse(
				fs.readFileSync(path.join(datasetDir, "result.json"), "utf8"),
			);
			expect(resultJson.name).toBe("basic_001");
			expect(resultJson.evalResult[0].score).toBe(5);
		});

		it("should create scenario-level result.json and summary.md", () => {
			const result = createMockScenarioResult();
			const outputDir = path.join(tmpDir, "output");
			writeResultsToDirectory(result, outputDir, mockLogger);

			const scenarioDirName = getScenarioDirectoryName(
				result.name,
				result.resultMetadata.timestamp,
			);

			expect(fs.existsSync(path.join(outputDir, scenarioDirName, "result.json"))).toBe(true);
			expect(fs.existsSync(path.join(outputDir, scenarioDirName, "summary.md"))).toBe(true);

			const scenarioJson = JSON.parse(
				fs.readFileSync(path.join(outputDir, scenarioDirName, "result.json"), "utf8"),
			);
			expect(scenarioJson.name).toBe(result.name);
			expect(scenarioJson.result.overallPercentage).toBe(50);
			expect(scenarioJson.result.status).toBe("NEEDS_IMPROVEMENT");
		});

		it("should set resultDirPath on each dataset result", () => {
			const result = createMockScenarioResult();
			const outputDir = path.join(tmpDir, "output");
			writeResultsToDirectory(result, outputDir, mockLogger);

			for (const ds of result.datasetResults) {
				expect(ds.resultDirPath).toBeDefined();
				expect(fs.existsSync(ds.resultDirPath!)).toBe(true);
				expect(fs.existsSync(path.join(ds.resultDirPath!, "summary.md"))).toBe(true);
			}
		});

		it("should write judgeModel from resultMetadata", () => {
			const result = createMockScenarioResult();
			const outputDir = path.join(tmpDir, "output");
			const scenarioDir = writeResultsToDirectory(result, outputDir, mockLogger);

			const scenarioJson = JSON.parse(
				fs.readFileSync(path.join(scenarioDir, "result.json"), "utf8"),
			);
			expect(scenarioJson.result.judgeModel).toBe("gpt-5-chat-mini");
		});

		it("should handle empty dataset results", () => {
			const result = createMockScenarioResult({
				datasetResults: [],
				resultMetadata: {
					totalDatasets: 0,
					averageScore: 0,
					totalExecutionTimeMs: 0,
					generatorModel: "gpt-5-chat-mini",
					judgeModel: "gpt-5-chat-mini",
					timestamp: new Date().toISOString(),
					rubricDimensionAggregates: {},
					totalPoints: 0,
					maxPossiblePoints: 0,
					overallPercentage: 0,
					status: "NEEDS_IMPROVEMENT",
				},
			});

			const outputDir = path.join(tmpDir, "empty");
			writeResultsToDirectory(result, outputDir, mockLogger);

			const scenarioDirName = getScenarioDirectoryName(
				result.name,
				result.resultMetadata.timestamp,
			);

			expect(fs.existsSync(path.join(outputDir, scenarioDirName, "result.json"))).toBe(true);
			expect(fs.existsSync(path.join(outputDir, scenarioDirName, "summary.md"))).toBe(true);
		});
	});

	describe("updateManualResultFiles", () => {
		let runDir: string;

		// Write a minimal manual run directory using writeResultsToDirectory output as the base
		beforeEach(() => {
			runDir = fs.mkdtempSync(path.join(os.tmpdir(), "eval-manual-test-"));
			const llmEvalConfig = {
				rubrics: [
					{ name: "Task Completion", description: "Did the agent complete the task?" },
					{ name: "Data Integrity", description: "Was the data preserved?" },
				],
				defaultScale: { min: 0, max: 5 },
			};
			const scenarioResult = {
				name: "My Scenario",
				appMetadata: {},
				result: {
					totalDatasets: 1,
					averageScore: 0,
					totalExecutionTimeMs: 0,
					generatorModel: "gpt-4o",
					judgeModel: "",
					timestamp: "2026-04-01T10:00:00.000Z",
					rubricDimensionAggregates: {},
					totalPoints: 0,
					maxPossiblePoints: 10,
					overallPercentage: 0,
					status: "NEEDS_IMPROVEMENT",
				},
			};
			const datasetResult = {
				name: "Dataset A",
				appMetadata: {},
				evalResult: [
					{
						rubricName: "Task Completion",
						score: undefined,
						reasoning: "",
						executionTimeMs: 0,
					},
					{
						rubricName: "Data Integrity",
						score: undefined,
						reasoning: "",
						executionTimeMs: 0,
					},
				],
				resultMetadata: {
					averageScore: 0,
					executionTimeMs: 0,
					timestamp: "2026-04-01T10:00:00.000Z",
					generatorModel: "gpt-4o",
					judgeModel: "",
				},
				input: {},
				output: {},
			};
			fs.writeFileSync(path.join(runDir, "result.json"), JSON.stringify(scenarioResult));
			fs.writeFileSync(path.join(runDir, "llmEvalConfig.json"), JSON.stringify(llmEvalConfig));
			fs.writeFileSync(path.join(runDir, "summary.md"), "");
			const dsDir = path.join(runDir, "dataset-dataset-a");
			fs.mkdirSync(dsDir, { recursive: true });
			fs.writeFileSync(path.join(dsDir, "result.json"), JSON.stringify(datasetResult));
			fs.writeFileSync(path.join(dsDir, "summary.md"), "");
		});

		afterEach(() => {
			fs.rmSync(runDir, { recursive: true, force: true });
		});

		it("writes scores into the dataset result.json", () => {
			updateManualResultFiles(runDir, {
				"Dataset A": {
					"Task Completion": { score: 4, reasoning: "Good" },
					"Data Integrity": { score: 3, reasoning: "OK" },
				},
			});

			const dsResult = JSON.parse(
				fs.readFileSync(path.join(runDir, "dataset-dataset-a", "result.json"), "utf8"),
			);
			expect(dsResult.evalResult).toEqual([
				{ rubricName: "Task Completion", score: 4, reasoning: "Good", executionTimeMs: 0 },
				{ rubricName: "Data Integrity", score: 3, reasoning: "OK", executionTimeMs: 0 },
			]);
		});

		it("updates averageScore in dataset result.json", () => {
			updateManualResultFiles(runDir, {
				"Dataset A": {
					"Task Completion": { score: 4, reasoning: "" },
					"Data Integrity": { score: 2, reasoning: "" },
				},
			});

			const dsResult = JSON.parse(
				fs.readFileSync(path.join(runDir, "dataset-dataset-a", "result.json"), "utf8"),
			);
			expect(dsResult.resultMetadata.averageScore).toBe(3);
		});

		it("updates scenario result.json with aggregated averageScore and status", () => {
			updateManualResultFiles(runDir, {
				"Dataset A": {
					"Task Completion": { score: 5, reasoning: "" },
					"Data Integrity": { score: 5, reasoning: "" },
				},
			});

			const scenarioResult = JSON.parse(
				fs.readFileSync(path.join(runDir, "result.json"), "utf8"),
			);
			expect(scenarioResult.result.averageScore).toBe(5);
			expect(scenarioResult.result.totalPoints).toBe(10);
			expect(scenarioResult.result.overallPercentage).toBe(100);
			expect(scenarioResult.result.status).toBe("GOOD");
		});

		it('always sets judgeModel to "Human" in both dataset and scenario result.json', () => {
			updateManualResultFiles(runDir, {
				"Dataset A": {
					"Task Completion": { score: 3, reasoning: "" },
					"Data Integrity": { score: 3, reasoning: "" },
				},
			});

			const scenarioResult = JSON.parse(
				fs.readFileSync(path.join(runDir, "result.json"), "utf8"),
			);
			expect(scenarioResult.result.judgeModel).toBe("Human");

			const dsResult = JSON.parse(
				fs.readFileSync(path.join(runDir, "dataset-dataset-a", "result.json"), "utf8"),
			);
			expect(dsResult.resultMetadata.judgeModel).toBe("Human");
		});

		it("treats null scores as unscored and excludes them from averages", () => {
			updateManualResultFiles(runDir, {
				"Dataset A": {
					"Task Completion": { score: undefined, reasoning: "" },
					"Data Integrity": { score: undefined, reasoning: "" },
				},
			});

			const dsResult = JSON.parse(
				fs.readFileSync(path.join(runDir, "dataset-dataset-a", "result.json"), "utf8"),
			);
			expect(dsResult.resultMetadata.averageScore).toBe(0);
			const scenarioResult = JSON.parse(
				fs.readFileSync(path.join(runDir, "result.json"), "utf8"),
			);
			expect(scenarioResult.result.averageScore).toBe(0);
			expect(scenarioResult.result.totalPoints).toBe(0);
		});

		it("writes summary.md files for dataset and scenario", () => {
			updateManualResultFiles(runDir, {
				"Dataset A": {
					"Task Completion": { score: 4, reasoning: "Done" },
					"Data Integrity": { score: 4, reasoning: "Intact" },
				},
			});

			const dsSummary = fs.readFileSync(
				path.join(runDir, "dataset-dataset-a", "summary.md"),
				"utf8",
			);
			expect(dsSummary).toContain("# Dataset: Dataset A");

			const scenarioSummary = fs.readFileSync(path.join(runDir, "summary.md"), "utf8");
			expect(scenarioSummary).toContain("# Scenario: My Scenario");
		});

		it("uses defaultScale from llmEvalConfig for percentage calculation", () => {
			// Override with scale max=10 — 5/10 points = 50%
			fs.writeFileSync(
				path.join(runDir, "llmEvalConfig.json"),
				JSON.stringify({
					rubrics: [{ name: "Task Completion" }, { name: "Data Integrity" }],
					defaultScale: { min: 0, max: 10 },
				}),
			);

			updateManualResultFiles(runDir, {
				"Dataset A": {
					"Task Completion": { score: 3, reasoning: "" },
					"Data Integrity": { score: 2, reasoning: "" },
				},
			});

			const scenarioResult = JSON.parse(
				fs.readFileSync(path.join(runDir, "result.json"), "utf8"),
			);
			// maxPossiblePoints = 1 dataset * 2 rubrics * 10 = 20, totalPoints = 5 → 25%
			expect(scenarioResult.result.maxPossiblePoints).toBe(20);
			expect(scenarioResult.result.totalPoints).toBe(5);
			expect(scenarioResult.result.overallPercentage).toBe(25);
		});
	});
});
