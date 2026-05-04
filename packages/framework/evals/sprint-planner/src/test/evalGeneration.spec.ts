/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import {
	buildScenarioArtifact,
	loadDatasetConfig,
	type DatasetConfig,
} from "../eval/evalGeneration.js";

describe("loadDatasetConfig", () => {
	it("loads and parses a dataset JSON file", () => {
		const datasetsDir = path.resolve(__dirname, "../../datasets");
		const config = loadDatasetConfig(datasetsDir, "createWorkItem.json");

		expect(config.name).toBe("Create Work Item");
		expect(config.datasets).toHaveLength(1);
		expect(config.datasets[0].prompt).toBe(
			"Create a new task titled 'Fix login bug' with high priority",
		);
		expect(config.rubrics).toBeDefined();
		expect(config.rubrics.length).toBeGreaterThan(0);
	});

	it("throws on non-existent dataset file", () => {
		const datasetsDir = path.resolve(__dirname, "../../datasets");
		expect(() => loadDatasetConfig(datasetsDir, "nonexistent.json")).toThrow();
	});
});

describe("buildScenarioArtifact", () => {
	it("builds a ScenarioArtifact from a dataset config and outputs", () => {
		const config: DatasetConfig = {
			name: "Test Scenario",
			datasets: [{ name: "Test dataset", prompt: "Do something" }],
			rubrics: [{ name: "Quality", description: "Is it good?" }],
			dataInterpretationPrompt: "Interpret this data.",
			domainHints: "Some hints.",
			metadata: { description: "A test" },
		};

		const datasetOutputs = [
			{
				name: "Test dataset",
				input: { prompt: "Do something", initialTreeState: { foo: "bar" } },
				output: { treeState: { foo: "baz" } },
			},
		];

		const artifact = buildScenarioArtifact(config, datasetOutputs, "gpt-4o");

		expect(artifact.name).toBe("Test Scenario");
		expect(artifact.modelType).toBe("gpt-4o");
		expect(artifact.datasetArtifacts).toHaveLength(1);
		expect(artifact.datasetArtifacts[0].name).toBe("Test dataset");
		expect(artifact.datasetArtifacts[0].input).toEqual({
			prompt: "Do something",
			initialTreeState: { foo: "bar" },
		});
		expect(artifact.datasetArtifacts[0].output).toEqual({ treeState: { foo: "baz" } });
		expect(artifact.llmEvalConfig.rubrics).toHaveLength(1);
		expect(artifact.llmEvalConfig.rubrics[0].name).toBe("Quality");
		expect(artifact.llmEvalConfig.dataInterpretationPrompt).toBe("Interpret this data.");
	});
});

describe("dataset files validation", () => {
	const datasetsDir = path.resolve(__dirname, "../../datasets");
	const datasetFiles = fs.readdirSync(datasetsDir).filter((f) => f.endsWith(".json"));

	it.each(datasetFiles)("%s has required fields", (file) => {
		const content = JSON.parse(fs.readFileSync(path.join(datasetsDir, file), "utf8"));

		expect(content.name).toBeDefined();
		expect(typeof content.name).toBe("string");
		expect(content.datasets).toBeDefined();
		expect(Array.isArray(content.datasets)).toBe(true);
		expect(content.datasets.length).toBeGreaterThan(0);
		expect(content.rubrics).toBeDefined();
		expect(Array.isArray(content.rubrics)).toBe(true);
		expect(content.rubrics.length).toBeGreaterThan(0);

		for (const ds of content.datasets) {
			expect(ds.name).toBeDefined();
			expect(ds.prompt).toBeDefined();
		}

		for (const rubric of content.rubrics) {
			expect(rubric.name).toBeDefined();
			expect(rubric.description).toBeDefined();
		}
	});
});
