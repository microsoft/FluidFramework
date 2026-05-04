/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * EvalFramework Unit Tests
 *
 * Tests the framework using in-memory ScenarioArtifacts and mocked LLM client.
 */

import * as fs from "node:fs";

import type { ScenarioArtifact } from "../artifactTypes.js";
import { EvalFramework } from "../framework.js";
import type { ILLMClient, ChatMessage, LLMResponse } from "../llmTypes.js";
import type { Logger } from "../loggerTypes.js";

// Mock fs for result writing only
jest.mock("node:fs", () => {
	const actual = jest.requireActual("node:fs");
	return {
		...actual,
		mkdirSync: jest.fn(),
		writeFileSync: jest.fn(),
		copyFileSync: jest.fn(),
	};
});

class MockLLMClient implements ILLMClient {
	calls: ChatMessage[][] = [];
	readonly #delay: number;

	constructor(delay = 0) {
		this.#delay = delay;
	}

	async chatCompletion(messages: ChatMessage[]): Promise<LLMResponse> {
		this.calls.push(messages);
		if (this.#delay > 0) {
			await new Promise((r) => setTimeout(r, this.#delay));
		}
		return {
			content:
				"Task Completion - Reasoning: Good, Score: 4\nContent Relevance - Reasoning: Relevant, Score: 5",
		};
	}
}

class FailingLLMClient implements ILLMClient {
	readonly #failOnCall: number;
	#callCount = 0;

	constructor(failOnCall: number) {
		this.#failOnCall = failOnCall;
	}

	async chatCompletion(_messages: ChatMessage[]): Promise<LLMResponse> {
		this.#callCount++;
		if (this.#callCount === this.#failOnCall) {
			throw new Error("LLM call failed");
		}
		return {
			content:
				"Task Completion - Reasoning: Good, Score: 4\nContent Relevance - Reasoning: Relevant, Score: 5",
		};
	}
}

const noopLogger: Logger = {
	info: () => {},
	warn: () => {},
	error: () => {},
	debug: () => {},
};

function makeSpyLogger(): Logger & { errors: string[] } {
	const errors: string[] = [];
	return {
		info: () => {},
		warn: () => {},
		error: (msg) => errors.push(msg),
		debug: () => {},
		errors,
	};
}

function createScenario(datasetCount: number): ScenarioArtifact {
	return {
		name: "test-scenario",
		llmEvalConfig: {
			rubrics: [
				{
					name: "Task Completion",
					description: "How well the output matches the requested task.",
				},
				{
					name: "Content Relevance",
					description: "How relevant the content is to the input.",
				},
			],
		},
		datasetArtifacts: Array.from({ length: datasetCount }, (_, i) => ({
			name: `dataset-${i + 1}`,
			input: { prompt: `test-${i + 1}` },
			output: { result: `generated-${i + 1}` },
			metadata: {},
		})),
		modelType: "test-model",
		metadata: {},
	};
}

describe("EvalFramework", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("sequential evaluation (default)", () => {
		it("should evaluate all datasets with default concurrency of 1", async () => {
			const client = new MockLLMClient();
			const framework = new EvalFramework({
				llmClient: client,
				logger: noopLogger,
				judgeModel: "test",
			});

			const result = await framework.run({ scenario: createScenario(3) });

			expect(result.datasetResults).toHaveLength(3);
			expect(result.datasetResults.map((d) => d.name)).toEqual([
				"dataset-1",
				"dataset-2",
				"dataset-3",
			]);
			expect(client.calls).toHaveLength(3);
		});
	});

	describe("concurrent evaluation", () => {
		it("should evaluate all datasets with concurrency > 1", async () => {
			const client = new MockLLMClient();
			const framework = new EvalFramework({
				llmClient: client,
				logger: noopLogger,
				judgeModel: "test",
				concurrency: 3,
			});

			const result = await framework.run({ scenario: createScenario(5) });

			expect(result.datasetResults).toHaveLength(5);
			expect(client.calls).toHaveLength(5);
		});

		it("should preserve result ordering regardless of completion order", async () => {
			const client = new MockLLMClient();
			const framework = new EvalFramework({
				llmClient: client,
				logger: noopLogger,
				judgeModel: "test",
				concurrency: 5,
			});

			const result = await framework.run({ scenario: createScenario(5) });

			expect(result.datasetResults.map((d) => d.name)).toEqual([
				"dataset-1",
				"dataset-2",
				"dataset-3",
				"dataset-4",
				"dataset-5",
			]);
		});

		it("should limit workers to dataset count when concurrency exceeds it", async () => {
			const client = new MockLLMClient();
			const framework = new EvalFramework({
				llmClient: client,
				logger: noopLogger,
				judgeModel: "test",
				concurrency: 100,
			});

			const result = await framework.run({ scenario: createScenario(2) });

			expect(result.datasetResults).toHaveLength(2);
			expect(client.calls).toHaveLength(2);
		});

		it("should handle a failing dataset without crashing other datasets", async () => {
			const failingClient = new FailingLLMClient(2); // Fail on 2nd LLM call
			const framework = new EvalFramework({
				llmClient: failingClient,
				logger: noopLogger,
				judgeModel: "test",
				concurrency: 3,
			});

			const result = await framework.run({ scenario: createScenario(3) });

			expect(result.datasetResults).toHaveLength(3);
			const successResults = result.datasetResults.filter(
				(d) => d.resultMetadata.averageScore > 0,
			);
			expect(successResults.length).toBe(2);
			const failedResults = result.datasetResults.filter(
				(d) => d.resultMetadata.averageScore === 0,
			);
			expect(failedResults.length).toBe(1);
		});

		it("should log the full cause chain including stack when a dataset fails", async () => {
			const failingClient = new FailingLLMClient(1); // Fail on 1st LLM call
			const logger = makeSpyLogger();
			const framework = new EvalFramework({
				llmClient: failingClient,
				logger,
				judgeModel: "test",
			});

			await framework.run({ scenario: createScenario(1) });

			expect(logger.errors).toHaveLength(1);
			const logged = logger.errors[0];
			// Should contain the wrapping message from the evaluator
			expect(logged).toContain("LLM evaluation failed");
			// Should contain the original LLM error message via the cause chain
			expect(logged).toContain("LLM call failed");
			// Should contain the "Caused by:" separator linking the two levels
			expect(logged).toContain("Caused by: ");
			// Should contain stack frames, not just bare messages
			expect(logged).toContain("at ");
		});

		it("should include the original error stack, not just its message", async () => {
			const failingClient = new FailingLLMClient(1);
			const logger = makeSpyLogger();
			const framework = new EvalFramework({
				llmClient: failingClient,
				logger,
				judgeModel: "test",
			});

			await framework.run({ scenario: createScenario(1) });

			const logged = logger.errors[0];
			// The outer "LLM evaluation failed" wrapper must appear before "Caused by:"
			const causedByIndex = logged.indexOf("Caused by: ");
			const outerSection = logged.slice(0, causedByIndex);
			expect(outerSection).toContain("LLM evaluation failed");
			// The original "LLM call failed" error must appear after "Caused by:"
			const innerSection = logged.slice(causedByIndex);
			expect(innerSection).toContain("LLM call failed");
		});

		it("should work correctly with concurrency of 1 (sequential)", async () => {
			const client = new MockLLMClient();
			const framework = new EvalFramework({
				llmClient: client,
				logger: noopLogger,
				judgeModel: "test",
				concurrency: 1,
			});

			const result = await framework.run({ scenario: createScenario(3) });

			expect(result.datasetResults).toHaveLength(3);
			expect(result.datasetResults.map((d) => d.name)).toEqual([
				"dataset-1",
				"dataset-2",
				"dataset-3",
			]);
		});
	});

	describe("resultsDirPath option", () => {
		it("should not write results to disk when resultsDirPath is omitted", async () => {
			const client = new MockLLMClient();
			const framework = new EvalFramework({
				llmClient: client,
				logger: noopLogger,
				judgeModel: "test",
			});

			await framework.run({ scenario: createScenario(1) });

			const writeFileCalls = (fs.writeFileSync as jest.Mock).mock.calls;
			expect(writeFileCalls.length).toBe(0);
		});

		it("should write results to disk when resultsDirPath is provided", async () => {
			const client = new MockLLMClient();
			const framework = new EvalFramework({
				llmClient: client,
				logger: noopLogger,
				judgeModel: "test",
			});

			await framework.run({ scenario: createScenario(1), resultsDirPath: "/output/results" });

			const writeFileCalls = (fs.writeFileSync as jest.Mock).mock.calls;
			expect(writeFileCalls.length).toBeGreaterThan(0);
		});
	});

	describe("dimension aggregation", () => {
		it("should compute per-dimension aggregates in resultMetadata", async () => {
			const client = new MockLLMClient();
			const framework = new EvalFramework({
				llmClient: client,
				logger: noopLogger,
				judgeModel: "test",
			});

			const result = await framework.run({ scenario: createScenario(3) });

			const meta = result.resultMetadata;
			// Mock returns score 4 for Task Completion and 5 for Content Relevance
			expect(meta.rubricDimensionAggregates["Task Completion"]).toEqual({
				average: 4,
				count: 3,
				min: 4,
				max: 4,
			});
			expect(meta.rubricDimensionAggregates["Content Relevance"]).toEqual({
				average: 5,
				count: 3,
				min: 5,
				max: 5,
			});
			// Total: 3*4 + 3*5 = 27, Max: 6 * 5 = 30, Percentage: 90%
			expect(meta.totalPoints).toBe(27);
			expect(meta.maxPossiblePoints).toBe(30);
			expect(meta.overallPercentage).toBe(90);
			expect(meta.status).toBe("GOOD");
		});

		it("should compute correct status thresholds", async () => {
			const lowClient: ILLMClient = {
				async chatCompletion(): Promise<LLMResponse> {
					return {
						content: "Dim1 - Reasoning: Bad, Score: 2\nDim2 - Reasoning: Bad, Score: 1",
					};
				},
			};
			const framework = new EvalFramework({
				llmClient: lowClient,
				logger: noopLogger,
				judgeModel: "test",
			});

			const scenario: ScenarioArtifact = {
				name: "low-score",
				llmEvalConfig: {
					rubrics: [
						{ name: "Dim1", description: "test" },
						{ name: "Dim2", description: "test" },
					],
					defaultScale: { min: 0, max: 10 },
				},
				datasetArtifacts: [{ name: "ds-1", input: {}, output: {}, metadata: {} }],
				modelType: "test-model",
				metadata: {},
			};

			const result = await framework.run({ scenario });
			expect(result.resultMetadata.overallPercentage).toBe(15);
			expect(result.resultMetadata.status).toBe("NEEDS_IMPROVEMENT");
		});

		it("should use custom defaultScale for percentage calculation", async () => {
			const client = new MockLLMClient(); // Returns score 4 and 5
			const framework = new EvalFramework({
				llmClient: client,
				logger: noopLogger,
				judgeModel: "test",
			});

			const scenario: ScenarioArtifact = {
				name: "custom-scale",
				llmEvalConfig: {
					rubrics: [
						{ name: "Task Completion", description: "test" },
						{ name: "Content Relevance", description: "test" },
					],
					defaultScale: { min: 0, max: 10 },
				},
				datasetArtifacts: [{ name: "ds-1", input: {}, output: {}, metadata: {} }],
				modelType: "test-model",
				metadata: {},
			};

			const result = await framework.run({ scenario });
			// Scores: 4 + 5 = 9, Max: 2 * 10 = 20, Percentage: 45%
			expect(result.resultMetadata.totalPoints).toBe(9);
			expect(result.resultMetadata.maxPossiblePoints).toBe(20);
			expect(result.resultMetadata.overallPercentage).toBe(45);
			expect(result.resultMetadata.status).toBe("NEEDS_IMPROVEMENT");
		});
	});

	describe("additional fields", () => {
		it("should extract additional fields from LLM response", async () => {
			const clientWithFields: ILLMClient = {
				async chatCompletion(): Promise<LLMResponse> {
					return {
						content: [
							"Quality - Reasoning: Well done, Score: 4",
							"Relevance - Reasoning: On topic, Score: 5",
							"overall_impression: A solid piece of work with minor issues.",
							'improvement_recommendations: ["Fix spacing", "Add more detail"]',
						].join("\n"),
					};
				},
			};
			const framework = new EvalFramework({
				llmClient: clientWithFields,
				logger: noopLogger,
				judgeModel: "test",
			});

			const scenario: ScenarioArtifact = {
				name: "fields-test",
				llmEvalConfig: {
					rubrics: [
						{ name: "Quality", description: "test" },
						{ name: "Relevance", description: "test" },
					],
					additionalFields: [
						{ name: "overall_impression", description: "1-2 sentence assessment" },
						{
							name: "improvement_recommendations",
							description: "JSON array of recommendations",
						},
					],
				},
				datasetArtifacts: [{ name: "ds-1", input: {}, output: {}, metadata: {} }],
				modelType: "test-model",
				metadata: {},
			};

			const result = await framework.run({ scenario });
			const evalResults = result.datasetResults[0].evalResult;

			// Additional fields should be on every EvaluationResult
			expect(evalResults[0].additionalFields).toBeDefined();
			expect(evalResults[0].additionalFields!.overall_impression).toBe(
				"A solid piece of work with minor issues.",
			);
			expect(evalResults[0].additionalFields!.improvement_recommendations).toBe(
				'["Fix spacing", "Add more detail"]',
			);
			// Scores should still parse correctly
			expect(evalResults[0].score).toBe(4);
			expect(evalResults[1].score).toBe(5);
		});

		it("should work without additional fields configured", async () => {
			const client = new MockLLMClient();
			const framework = new EvalFramework({
				llmClient: client,
				logger: noopLogger,
				judgeModel: "test",
			});

			const result = await framework.run({ scenario: createScenario(1) });
			const evalResults = result.datasetResults[0].evalResult;

			// No additional fields configured — field should be undefined
			expect(evalResults[0].additionalFields).toBeUndefined();
		});
	});
});
