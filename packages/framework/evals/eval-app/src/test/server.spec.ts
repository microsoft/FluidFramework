/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
	findScenarioDirName,
	readDatasetSummaries,
	readScenarioSummary,
	listRuns,
	listManualRuns,
	parseTimestampFromDirName,
} from "../dataReaders.js";

function createTempDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "eval-app-test-"));
}

function createNestedStructure(runDir: string) {
	// Nested layout:
	// runDir/
	//   scenario-my-test-2026-03-19T23-47-50-776Z/
	//     llmEvalConfig.json
	//     result.json
	//     summary.md
	//     dataset-banana-bread-shopping-list/
	//       summary.md
	//       result.json  (with name: "Banana bread shopping list")
	//     dataset-simple-math/
	//       summary.md

	const scenarioDir = path.join(runDir, "scenario-my-test-2026-03-19T23-47-50-776Z");
	fs.mkdirSync(scenarioDir, { recursive: true });
	fs.writeFileSync(path.join(scenarioDir, "llmEvalConfig.json"), "{}");
	fs.writeFileSync(path.join(scenarioDir, "result.json"), "{}");
	fs.writeFileSync(path.join(scenarioDir, "summary.md"), "# Scenario Summary");

	const ds1 = path.join(scenarioDir, "dataset-banana-bread-shopping-list");
	fs.mkdirSync(ds1, { recursive: true });
	fs.writeFileSync(path.join(ds1, "summary.md"), "# Banana Bread Dataset");
	fs.writeFileSync(
		path.join(ds1, "result.json"),
		JSON.stringify({ name: "Banana bread shopping list" }),
	);

	const ds2 = path.join(scenarioDir, "dataset-simple-math");
	fs.mkdirSync(ds2, { recursive: true });
	fs.writeFileSync(path.join(ds2, "summary.md"), "# Simple Math Dataset");

	return { scenarioDir, ds1, ds2 };
}

function createFlatStructure(runDir: string) {
	// Flat layout: runDir IS the scenario dir (llmEvalConfig.json at root)
	// runDir/
	//   llmEvalConfig.json
	//   result.json
	//   summary.md
	//   dataset-banana-bread-shopping-list/
	//     summary.md
	//     result.json  (with name: "Banana bread shopping list")
	//   dataset-simple-math/
	//     summary.md

	fs.writeFileSync(path.join(runDir, "llmEvalConfig.json"), "{}");
	fs.writeFileSync(path.join(runDir, "result.json"), "{}");
	fs.writeFileSync(path.join(runDir, "summary.md"), "# Scenario Summary");

	const ds1 = path.join(runDir, "dataset-banana-bread-shopping-list");
	fs.mkdirSync(ds1, { recursive: true });
	fs.writeFileSync(path.join(ds1, "summary.md"), "# Banana Bread Dataset");
	fs.writeFileSync(
		path.join(ds1, "result.json"),
		JSON.stringify({ name: "Banana bread shopping list" }),
	);

	const ds2 = path.join(runDir, "dataset-simple-math");
	fs.mkdirSync(ds2, { recursive: true });
	fs.writeFileSync(path.join(ds2, "summary.md"), "# Simple Math Dataset");

	return { ds1, ds2 };
}

// ── findScenarioDirName ─────────────────────────────────────────────

describe("findScenarioDirName", () => {
	let runDir: string;

	beforeEach(() => {
		runDir = createTempDir();
	});

	afterEach(() => {
		fs.rmSync(runDir, { recursive: true, force: true });
	});

	test("returns the scenario subdirectory name when it contains llmEvalConfig.json", () => {
		createNestedStructure(runDir);
		const result = findScenarioDirName(runDir);
		expect(result).toBe("scenario-my-test-2026-03-19T23-47-50-776Z");
	});

	test("returns undefined when no scenario subdirectory exists", () => {
		const result = findScenarioDirName(runDir);
		expect(result).toBeUndefined();
	});

	test("returns undefined when llmEvalConfig.json is at root (flat layout)", () => {
		createFlatStructure(runDir);
		const result = findScenarioDirName(runDir);
		expect(result).toBeUndefined();
	});

	test("returns undefined when runDir does not exist", () => {
		const result = findScenarioDirName("/nonexistent/path/that/does/not/exist");
		expect(result).toBeUndefined();
	});

	test("ignores files named like directories", () => {
		fs.writeFileSync(path.join(runDir, "not-a-dir"), "just a file");
		const result = findScenarioDirName(runDir);
		expect(result).toBeUndefined();
	});
});

// ── readDatasetSummaries ────────────────────────────────────────────

describe("readDatasetSummaries", () => {
	let runDir: string;

	beforeEach(() => {
		runDir = createTempDir();
	});

	afterEach(() => {
		fs.rmSync(runDir, { recursive: true, force: true });
	});

	// Nested layout tests
	test("finds dataset directories inside the scenario subdirectory", () => {
		createNestedStructure(runDir);
		const summaries = readDatasetSummaries(runDir);
		expect(summaries).toHaveLength(2);
	});

	test("returns dirName matching the actual directory name", () => {
		createNestedStructure(runDir);
		const summaries = readDatasetSummaries(runDir);
		const dirNames = summaries.map((s) => s.dirName).sort();
		expect(dirNames).toEqual(["dataset-banana-bread-shopping-list", "dataset-simple-math"]);
	});

	test("returns datasetName from result.json name field when available", () => {
		createNestedStructure(runDir);
		const summaries = readDatasetSummaries(runDir);
		const banana = summaries.find((s) => s.dirName === "dataset-banana-bread-shopping-list");
		expect(banana?.datasetName).toBe("Banana bread shopping list");
	});

	test("falls back to directory name when result.json is missing", () => {
		createNestedStructure(runDir);
		const summaries = readDatasetSummaries(runDir);
		const math = summaries.find((s) => s.dirName === "dataset-simple-math");
		expect(math?.datasetName).toBe("dataset-simple-math");
	});

	test("returns the markdown content from summary.md", () => {
		createNestedStructure(runDir);
		const summaries = readDatasetSummaries(runDir);
		const banana = summaries.find((s) => s.dirName === "dataset-banana-bread-shopping-list");
		expect(banana?.markdown).toBe("# Banana Bread Dataset");
	});

	test("returns empty array when runDir does not exist", () => {
		const summaries = readDatasetSummaries("/nonexistent/path/that/does/not/exist");
		expect(summaries).toEqual([]);
	});

	test("returns empty array when no scenario subdirectory exists", () => {
		const summaries = readDatasetSummaries(runDir);
		expect(summaries).toEqual([]);
	});

	// Flat layout tests
	test("finds dataset directories in flat layout (llmEvalConfig.json at root)", () => {
		createFlatStructure(runDir);
		const summaries = readDatasetSummaries(runDir);
		expect(summaries).toHaveLength(2);
	});

	test("returns correct dirName and datasetName in flat layout", () => {
		createFlatStructure(runDir);
		const summaries = readDatasetSummaries(runDir);
		const banana = summaries.find((s) => s.dirName === "dataset-banana-bread-shopping-list");
		expect(banana?.datasetName).toBe("Banana bread shopping list");
		const math = summaries.find((s) => s.dirName === "dataset-simple-math");
		expect(math?.datasetName).toBe("dataset-simple-math");
	});

	// Edge cases
	test("falls back to directory name when result.json contains invalid JSON", () => {
		createFlatStructure(runDir);
		fs.writeFileSync(
			path.join(runDir, "dataset-banana-bread-shopping-list", "result.json"),
			"NOT JSON",
		);
		const summaries = readDatasetSummaries(runDir);
		const banana = summaries.find((s) => s.dirName === "dataset-banana-bread-shopping-list");
		expect(banana?.datasetName).toBe("dataset-banana-bread-shopping-list");
	});

	test("skips subdirectories that have no summary.md", () => {
		createFlatStructure(runDir);
		const noSummary = path.join(runDir, "dataset-no-summary");
		fs.mkdirSync(noSummary, { recursive: true });
		fs.writeFileSync(path.join(noSummary, "result.json"), "{}");
		const summaries = readDatasetSummaries(runDir);
		expect(summaries).toHaveLength(2);
		expect(summaries.find((s) => s.dirName === "dataset-no-summary")).toBeUndefined();
	});

	test("handles a single dataset", () => {
		fs.writeFileSync(path.join(runDir, "llmEvalConfig.json"), "{}");
		const ds = path.join(runDir, "dataset-only-one");
		fs.mkdirSync(ds, { recursive: true });
		fs.writeFileSync(path.join(ds, "summary.md"), "# Only Dataset");
		const summaries = readDatasetSummaries(runDir);
		expect(summaries).toHaveLength(1);
		expect(summaries[0].dirName).toBe("dataset-only-one");
		expect(summaries[0].datasetName).toBe("dataset-only-one");
		expect(summaries[0].markdown).toBe("# Only Dataset");
	});

	test("returns empty array when directory has only non-dataset subdirs", () => {
		fs.writeFileSync(path.join(runDir, "llmEvalConfig.json"), "{}");
		fs.writeFileSync(path.join(runDir, "result.json"), "{}");
		const summaries = readDatasetSummaries(runDir);
		expect(summaries).toEqual([]);
	});
});

// ── readScenarioSummary ─────────────────────────────────────────────

describe("readScenarioSummary", () => {
	let dir: string;

	beforeEach(() => {
		dir = createTempDir();
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	test("returns summary.md at root when present (flat layout)", () => {
		fs.writeFileSync(path.join(dir, "summary.md"), "# Direct Summary");
		const result = readScenarioSummary(dir);
		expect(result).toBe("# Direct Summary");
	});

	test("finds summary.md in scenario subdirectory (nested layout)", () => {
		const scenarioDir = path.join(dir, "scenario-test-2026-03-19T23-47-50-776Z");
		fs.mkdirSync(scenarioDir, { recursive: true });
		fs.writeFileSync(path.join(scenarioDir, "llmEvalConfig.json"), "{}");
		fs.writeFileSync(path.join(scenarioDir, "summary.md"), "# Nested Summary");
		const result = readScenarioSummary(dir);
		expect(result).toBe("# Nested Summary");
	});

	test("prefers root summary.md over nested when both exist", () => {
		fs.writeFileSync(path.join(dir, "summary.md"), "# Root Summary");
		const scenarioDir = path.join(dir, "scenario-test");
		fs.mkdirSync(scenarioDir, { recursive: true });
		fs.writeFileSync(path.join(scenarioDir, "llmEvalConfig.json"), "{}");
		fs.writeFileSync(path.join(scenarioDir, "summary.md"), "# Nested Summary");
		const result = readScenarioSummary(dir);
		expect(result).toBe("# Root Summary");
	});

	test("returns undefined when no summary.md exists anywhere", () => {
		const result = readScenarioSummary(dir);
		expect(result).toBeUndefined();
	});

	test("returns undefined when directory does not exist", () => {
		const result = readScenarioSummary("/nonexistent/path");
		expect(result).toBeUndefined();
	});

	test("ignores subdirectories without llmEvalConfig.json", () => {
		const subdir = path.join(dir, "random-subdir");
		fs.mkdirSync(subdir, { recursive: true });
		fs.writeFileSync(path.join(subdir, "summary.md"), "# Should Be Ignored");
		const result = readScenarioSummary(dir);
		expect(result).toBeUndefined();
	});
});

// ── parseTimestampFromDirName ───────────────────────────────────────

describe("parseTimestampFromDirName", () => {
	test("parses a standard scenario directory name", () => {
		const result = parseTimestampFromDirName(
			"scenario-simple-chat-to-board-2026-03-19T23-47-50-776Z",
		);
		expect(result).toBe("2026-03-19T23:47:50.776Z");
	});

	test("parses with different scenario names", () => {
		const result = parseTimestampFromDirName("scenario-x-2025-01-01T00-00-00-000Z");
		expect(result).toBe("2025-01-01T00:00:00.000Z");
	});

	test("returns empty string for names without a timestamp", () => {
		expect(parseTimestampFromDirName("some-random-dir")).toBe("");
		expect(parseTimestampFromDirName("")).toBe("");
	});

	test("returns empty string for partial timestamp", () => {
		expect(parseTimestampFromDirName("scenario-2026-03-19")).toBe("");
	});
});

// ── listRuns ────────────────────────────────────────────────────────

describe("listRuns", () => {
	let resultsDir: string;

	beforeEach(() => {
		resultsDir = createTempDir();
	});

	afterEach(() => {
		fs.rmSync(resultsDir, { recursive: true, force: true });
	});

	test("returns empty array when resultsDir does not exist", () => {
		const runs = listRuns("/nonexistent/path");
		expect(runs).toEqual([]);
	});

	test("returns empty array when resultsDir is empty", () => {
		const runs = listRuns(resultsDir);
		expect(runs).toEqual([]);
	});

	test("discovers flat-layout runs", () => {
		const run1 = path.join(resultsDir, "scenario-test-2026-03-19T23-47-50-776Z");
		fs.mkdirSync(run1, { recursive: true });
		fs.writeFileSync(path.join(run1, "llmEvalConfig.json"), "{}");
		fs.writeFileSync(
			path.join(run1, "result.json"),
			JSON.stringify({
				name: "My Test Scenario",
				result: {
					judgeModel: "gpt-4",
					generatorModel: "claude-3",
					averageScore: 4.2,
					timestamp: "2026-03-19T23:47:50.776Z",
				},
			}),
		);

		const ds1 = path.join(run1, "dataset-foo");
		fs.mkdirSync(ds1, { recursive: true });
		fs.writeFileSync(path.join(ds1, "summary.md"), "# Foo");

		const runs = listRuns(resultsDir);
		expect(runs).toHaveLength(1);
		expect(runs[0].name).toBe("scenario-test-2026-03-19T23-47-50-776Z");
		expect(runs[0].scenarioName).toBe("My Test Scenario");
		expect(runs[0].resultPath).toBe(
			"/api/results/scenario-test-2026-03-19T23-47-50-776Z/result.json",
		);
		expect(runs[0].datasets).toEqual(["dataset-foo"]);
		expect(runs[0].averageScore).toBe(4.2);
		expect(runs[0].judgeModel).toBe("gpt-4");
		expect(runs[0].generatorModel).toBe("claude-3");
		expect(runs[0].timestamp).toBe("2026-03-19T23:47:50.776Z");
	});

	test("discovers nested-layout runs", () => {
		const runDir = path.join(resultsDir, "run-2026-03-19");
		fs.mkdirSync(runDir, { recursive: true });

		const scenarioDir = path.join(runDir, "scenario-nested-2026-03-19T12-00-00-000Z");
		fs.mkdirSync(scenarioDir, { recursive: true });
		fs.writeFileSync(path.join(scenarioDir, "llmEvalConfig.json"), "{}");
		fs.writeFileSync(
			path.join(scenarioDir, "result.json"),
			JSON.stringify({ name: "Nested Scenario" }),
		);

		const ds = path.join(scenarioDir, "dataset-bar");
		fs.mkdirSync(ds, { recursive: true });
		fs.writeFileSync(path.join(ds, "summary.md"), "# Bar");

		const runs = listRuns(resultsDir);
		expect(runs).toHaveLength(1);
		expect(runs[0].name).toBe("run-2026-03-19");
		expect(runs[0].scenarioName).toBe("Nested Scenario");
		expect(runs[0].resultPath).toBe(
			"/api/results/run-2026-03-19/scenario-nested-2026-03-19T12-00-00-000Z/result.json",
		);
		expect(runs[0].datasets).toEqual(["dataset-bar"]);
	});

	test("skips directories without llmEvalConfig.json", () => {
		const invalidDir = path.join(resultsDir, "not-a-run");
		fs.mkdirSync(invalidDir, { recursive: true });
		fs.writeFileSync(path.join(invalidDir, "random.txt"), "hello");

		const runs = listRuns(resultsDir);
		expect(runs).toEqual([]);
	});

	test("returns runs in reverse-sorted order", () => {
		for (const name of ["run-a", "run-c", "run-b"]) {
			const d = path.join(resultsDir, name);
			fs.mkdirSync(d, { recursive: true });
			fs.writeFileSync(path.join(d, "llmEvalConfig.json"), "{}");
		}
		const runs = listRuns(resultsDir);
		expect(runs.map((r) => r.name)).toEqual(["run-c", "run-b", "run-a"]);
	});

	test("falls back to dataset-level result.json for metadata", () => {
		const run = path.join(resultsDir, "scenario-fallback-2026-01-15T10-30-00-000Z");
		fs.mkdirSync(run, { recursive: true });
		fs.writeFileSync(path.join(run, "llmEvalConfig.json"), "{}");
		// scenario result.json has no metadata
		fs.writeFileSync(path.join(run, "result.json"), JSON.stringify({ name: "Fallback" }));

		const ds = path.join(run, "dataset-with-meta");
		fs.mkdirSync(ds, { recursive: true });
		fs.writeFileSync(path.join(ds, "summary.md"), "# Meta");
		fs.writeFileSync(
			path.join(ds, "result.json"),
			JSON.stringify({
				resultMetadata: {
					timestamp: "2026-01-15T10:30:00.000Z",
					judgeModel: "judge-from-dataset",
					generatorModel: "gen-from-dataset",
					averageScore: 3.5,
				},
			}),
		);

		const runs = listRuns(resultsDir);
		expect(runs).toHaveLength(1);
		expect(runs[0].timestamp).toBe("2026-01-15T10:30:00.000Z");
		expect(runs[0].judgeModel).toBe("judge-from-dataset");
		expect(runs[0].generatorModel).toBe("gen-from-dataset");
		expect(runs[0].averageScore).toBe(3.5);
	});

	test("falls back to directory name for timestamp when no result.json has it", () => {
		const run = path.join(resultsDir, "scenario-ts-test-2026-06-15T08-30-00-123Z");
		fs.mkdirSync(run, { recursive: true });
		fs.writeFileSync(path.join(run, "llmEvalConfig.json"), "{}");

		const runs = listRuns(resultsDir);
		expect(runs).toHaveLength(1);
		expect(runs[0].timestamp).toBe("2026-06-15T08:30:00.123Z");
	});

	test("handles mix of flat and nested runs", () => {
		// Flat run
		const flat = path.join(resultsDir, "scenario-flat-2026-03-20T00-00-00-000Z");
		fs.mkdirSync(flat, { recursive: true });
		fs.writeFileSync(path.join(flat, "llmEvalConfig.json"), "{}");

		// Nested run
		const nested = path.join(resultsDir, "run-nested");
		const nestedScenario = path.join(nested, "scenario-inner-2026-03-19T00-00-00-000Z");
		fs.mkdirSync(nestedScenario, { recursive: true });
		fs.writeFileSync(path.join(nestedScenario, "llmEvalConfig.json"), "{}");

		const runs = listRuns(resultsDir);
		expect(runs).toHaveLength(2);
		const names = runs.map((r) => r.name);
		expect(names).toContain("scenario-flat-2026-03-20T00-00-00-000Z");
		expect(names).toContain("run-nested");
	});

	test("skips non-directory entries in resultsDir", () => {
		fs.writeFileSync(path.join(resultsDir, "stray-file.txt"), "hello");
		const run = path.join(resultsDir, "scenario-valid-2026-01-01T00-00-00-000Z");
		fs.mkdirSync(run, { recursive: true });
		fs.writeFileSync(path.join(run, "llmEvalConfig.json"), "{}");

		const runs = listRuns(resultsDir);
		expect(runs).toHaveLength(1);
		expect(runs[0].name).toBe("scenario-valid-2026-01-01T00-00-00-000Z");
	});
});

describe("listManualRuns", () => {
	let resultsDir: string;

	beforeEach(() => {
		resultsDir = createTempDir();
	});

	afterEach(() => {
		fs.rmSync(resultsDir, { recursive: true, force: true });
	});

	function writeManualRun(
		name: string,
		resultJson: object,
		datasets: { dirName: string; resultJson: object }[] = [],
	) {
		const runDir = path.join(resultsDir, "manual", name);
		fs.mkdirSync(runDir, { recursive: true });
		fs.writeFileSync(path.join(runDir, "result.json"), JSON.stringify(resultJson));
		for (const ds of datasets) {
			const dsDir = path.join(runDir, ds.dirName);
			fs.mkdirSync(dsDir, { recursive: true });
			fs.writeFileSync(path.join(dsDir, "result.json"), JSON.stringify(ds.resultJson));
		}
		return runDir;
	}

	test("returns empty array when manual dir does not exist", () => {
		expect(listManualRuns(resultsDir)).toEqual([]);
	});

	test("returns empty array when manual dir is empty", () => {
		fs.mkdirSync(path.join(resultsDir, "manual"), { recursive: true });
		expect(listManualRuns(resultsDir)).toEqual([]);
	});

	test("skips run directories missing result.json", () => {
		const runDir = path.join(resultsDir, "manual", "scenario-no-result");
		fs.mkdirSync(runDir, { recursive: true });
		expect(listManualRuns(resultsDir)).toEqual([]);
	});

	test("returns run with metadata from result.json", () => {
		writeManualRun("scenario-my-run-2026-04-01T10-00-00-000Z", {
			name: "My Scenario",
			result: {
				generatorModel: "gpt-4o",
				averageScore: 3.5,
				timestamp: "2026-04-01T10:00:00.000Z",
			},
		});

		const runs = listManualRuns(resultsDir);
		expect(runs).toHaveLength(1);
		expect(runs[0].scenarioName).toBe("My Scenario");
		expect(runs[0].generatorModel).toBe("gpt-4o");
		expect(runs[0].averageScore).toBe(3.5);
		expect(runs[0].timestamp).toBe("2026-04-01T10:00:00.000Z");
		expect(runs[0].runType).toBe("manual");
	});

	test('always returns judgeModel as "Human"', () => {
		writeManualRun("scenario-run-2026-04-01T10-00-00-000Z", {
			name: "Test",
			result: { timestamp: "2026-04-01T10:00:00.000Z" },
		});

		const runs = listManualRuns(resultsDir);
		expect(runs[0].judgeModel).toBe("Human");
	});

	test("collects dataset names from dataset subdirectories", () => {
		writeManualRun(
			"scenario-run-2026-04-01T10-00-00-000Z",
			{ name: "Test", result: { timestamp: "2026-04-01T10:00:00.000Z" } },
			[
				{ dirName: "dataset-foo", resultJson: { name: "Foo Dataset" } },
				{ dirName: "dataset-bar", resultJson: { name: "Bar Dataset" } },
			],
		);

		const runs = listManualRuns(resultsDir);
		expect(runs[0].datasets).toEqual(["Bar Dataset", "Foo Dataset"]);
	});

	test("sorts runs by timestamp descending", () => {
		writeManualRun("scenario-b-2026-04-01T10-00-00-000Z", {
			name: "B",
			result: { timestamp: "2026-04-01T10:00:00.000Z" },
		});
		writeManualRun("scenario-a-2026-04-02T10-00-00-000Z", {
			name: "A",
			result: { timestamp: "2026-04-02T10:00:00.000Z" },
		});

		const runs = listManualRuns(resultsDir);
		expect(runs[0].scenarioName).toBe("A");
		expect(runs[1].scenarioName).toBe("B");
	});

	test("reads customResultProperties from result.json", () => {
		writeManualRun("scenario-run-2026-04-01T10-00-00-000Z", {
			name: "Test",
			customResultProperties: { colorFilter: "red", version: 2 },
			result: { timestamp: "2026-04-01T10:00:00.000Z" },
		});

		const runs = listManualRuns(resultsDir);
		expect(runs[0].customResultProperties).toEqual({ colorFilter: "red", version: 2 });
	});
});
