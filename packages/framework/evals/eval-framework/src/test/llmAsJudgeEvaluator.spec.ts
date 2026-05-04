/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * LLM As Judge Evaluator Unit Tests
 *
 * Tests the LLM-as-judge evaluator using MockLLMClient (no real AugLoop calls).
 */

import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

import type { EvaluationContext } from "../evaluators/evaluatorTypes.js";
import { LlmAsJudgeEvaluator } from "../evaluators/llmAsJudgeEvaluator.js";
import {
	buildUserPrompt,
	buildSystemPrompt,
	parseScores,
	resolveImages,
	inferMediaType,
} from "../evaluators/prompts.js";
import type { JsonObject, Rubric, Logger, ContentBlock } from "../index.js";
import type { ILLMClient, ChatMessage, LLMResponse } from "../llmTypes.js";

/**
 * Mock LLM client for testing.
 * Returns configurable canned responses without making real LLM calls.
 */
class MockLLMClient implements ILLMClient {
	readonly #responses: string[];
	#callIndex = 0;
	readonly calls: ChatMessage[][] = [];

	constructor(responses: string | string[]) {
		this.#responses = Array.isArray(responses) ? responses : [responses];
	}

	async chatCompletion(messages: ChatMessage[]): Promise<LLMResponse> {
		this.calls.push(messages);
		const responseIndex = Math.min(this.#callIndex, this.#responses.length - 1);
		const content = this.#responses[responseIndex];
		this.#callIndex += 1;
		return { content };
	}
}

/** Test rubrics matching the 3 default dimensions used in tests. */
const TEST_RUBRICS: Rubric[] = [
	{ name: "Task Completion", description: "How well the output matches the requested task." },
	{ name: "Structure Quality", description: "Quality of the structural layout." },
	{ name: "Content Relevance", description: "How relevant the content is to the input." },
];

const noopLogger: Logger = {
	info: () => {},
	warn: () => {},
	error: () => {},
	debug: () => {},
};

/**
 * Helper to create an evaluation context with required fields.
 */
function createContext(
	treeState: JsonObject,
	rubrics: Rubric[] = TEST_RUBRICS,
): EvaluationContext {
	return {
		output: treeState,
		judgeModel: "gpt-5-chat-mini",
		rubrics,
		logger: noopLogger,
	};
}

/**
 * Helper to create a minimal tree-shaped JsonObject for testing.
 * Mirrors the structure of TreeAlpha.exportVerbose(NodeState root).
 */
function createVerboseTree(nodes: JsonObject = {}, edges: JsonObject = {}): JsonObject {
	return {
		type: "com.microsoft.copilotBoards.NodeState",
		fields: {
			nodes: { type: "com.microsoft.copilotBoards.NodeState#nodes", entries: nodes },
			edges: { type: "com.microsoft.copilotBoards.NodeState#edges", entries: edges },
			metadata: { type: "com.microsoft.copilotBoards.NodeState#metadata", entries: {} },
		},
	};
}

/**
 * Helper to create a well-formatted LLM response matching the 3 test rubric dimensions.
 * Uses the format: "Name - Reasoning: <text>, Score: <n>"
 */
function createLLMResponse(scores: {
	taskCompletion: number;
	structureQuality: number;
	contentRelevance: number;
	taskCompletionReasoning?: string;
	structureQualityReasoning?: string;
	contentRelevanceReasoning?: string;
}): string {
	return [
		`Task Completion - Reasoning: ${scores.taskCompletionReasoning ?? "Meets expectations."}, Score: ${scores.taskCompletion}`,
		`Structure Quality - Reasoning: ${scores.structureQualityReasoning ?? "Meets expectations."}, Score: ${scores.structureQuality}`,
		`Content Relevance - Reasoning: ${scores.contentRelevanceReasoning ?? "Meets expectations."}, Score: ${scores.contentRelevance}`,
	].join("\n");
}

describe("LLM As Judge Evaluator", () => {
	describe("score parsing", () => {
		it("should parse valid response with all dimensions", () => {
			const response = createLLMResponse({
				taskCompletion: 4,
				structureQuality: 3,
				contentRelevance: 4,
				taskCompletionReasoning: "All requested elements present.",
				structureQualityReasoning: "Reasonable structure.",
				contentRelevanceReasoning: "Relevant content throughout.",
			});

			const parsed = parseScores(response, TEST_RUBRICS);
			expect(parsed).toBeDefined();
			expect(parsed?.["Task Completion"]).toEqual({
				score: 4,
				reasoning: "All requested elements present.",
			});
			expect(parsed?.["Structure Quality"]).toEqual({
				score: 3,
				reasoning: "Reasonable structure.",
			});
			expect(parsed?.["Content Relevance"]).toEqual({
				score: 4,
				reasoning: "Relevant content throughout.",
			});
		});

		it("should return undefined when a dimension is missing", () => {
			const response = [
				"Task Completion - Reasoning: Good., Score: 4",
				// Missing Structure Quality
				"Content Relevance - Reasoning: Relevant., Score: 4",
			].join("\n");

			const parsed = parseScores(response, TEST_RUBRICS);
			expect(parsed).toBeUndefined();
		});

		it("should return undefined for completely malformed response", () => {
			const parsed = parseScores(
				"This is not a valid evaluation response at all.",
				TEST_RUBRICS,
			);
			expect(parsed).toBeUndefined();
		});

		it("should handle edge case scores of 0", () => {
			const response = createLLMResponse({
				taskCompletion: 0,
				structureQuality: 0,
				contentRelevance: 0,
			});

			const parsed = parseScores(response, TEST_RUBRICS);
			expect(parsed).toBeDefined();
			expect(parsed?.["Task Completion"].score).toBe(0);
			expect(parsed?.["Structure Quality"].score).toBe(0);
			expect(parsed?.["Content Relevance"].score).toBe(0);
		});

		it("should handle edge case scores of 5", () => {
			const response = createLLMResponse({
				taskCompletion: 5,
				structureQuality: 5,
				contentRelevance: 5,
			});

			const parsed = parseScores(response, TEST_RUBRICS);
			expect(parsed).toBeDefined();
			expect(parsed?.["Task Completion"].score).toBe(5);
			expect(parsed?.["Structure Quality"].score).toBe(5);
			expect(parsed?.["Content Relevance"].score).toBe(5);
		});

		it("should handle commas within reasoning text", () => {
			const response = [
				"Task Completion - Reasoning: The output is good, thorough, and complete, Score: 4",
				"Structure Quality - Reasoning: Well structured, clean, and organized. Score: 3",
				"Content Relevance - Reasoning: Relevant, accurate, and on-topic, Score: 5",
			].join("\n");

			const parsed = parseScores(response, TEST_RUBRICS);
			expect(parsed).toBeDefined();
			expect(parsed?.["Task Completion"]).toEqual({
				score: 4,
				reasoning: "The output is good, thorough, and complete",
			});
			expect(parsed?.["Structure Quality"]).toEqual({
				score: 3,
				reasoning: "Well structured, clean, and organized",
			});
			expect(parsed?.["Content Relevance"]).toEqual({
				score: 5,
				reasoning: "Relevant, accurate, and on-topic",
			});
		});

		it("should accept period as delimiter before Score", () => {
			const response = [
				"Task Completion - Reasoning: Good output. Score: 4",
				"Structure Quality - Reasoning: Solid structure. Score: 3",
				"Content Relevance - Reasoning: On topic. Score: 5",
			].join("\n");

			const parsed = parseScores(response, TEST_RUBRICS);
			expect(parsed).toBeDefined();
			expect(parsed?.["Task Completion"].score).toBe(4);
			expect(parsed?.["Structure Quality"].score).toBe(3);
			expect(parsed?.["Content Relevance"].score).toBe(5);
		});

		it("should be case-insensitive", () => {
			const response = [
				"TASK COMPLETION - Reasoning: Mixed case task response., Score: 4",
				"STRUCTURE QUALITY - Reasoning: Mixed case structure response., Score: 5",
				"CONTENT RELEVANCE - Reasoning: Mixed case content response., Score: 2",
			].join("\n");

			const parsed = parseScores(response, TEST_RUBRICS);
			expect(parsed).toBeDefined();
			expect(parsed?.["Task Completion"].score).toBe(4);
			expect(parsed?.["Structure Quality"].score).toBe(5);
			expect(parsed?.["Content Relevance"].score).toBe(2);
		});
	});

	describe("evaluator behavior", () => {
		it("should return results for each rubric with all-5s response", async () => {
			const mockClient = new MockLLMClient(
				createLLMResponse({
					taskCompletion: 5,
					structureQuality: 5,
					contentRelevance: 5,
					taskCompletionReasoning: "All requirements met.",
					structureQualityReasoning: "Well connected.",
					contentRelevanceReasoning: "Specific content.",
				}),
			);

			const evaluator = new LlmAsJudgeEvaluator(mockClient);
			const context = createContext(createVerboseTree({ n1: { type: "inputTextNote" } }));

			const results = await evaluator.evaluate(context);
			expect(Array.isArray(results)).toBe(true);
			expect(results).toHaveLength(3);

			const taskCompletion = results.find((r) => r.rubricName === "Task Completion");
			expect(taskCompletion?.score).toBe(5);
			expect(taskCompletion?.reasoning).toBe("All requirements met.");

			const structureQuality = results.find((r) => r.rubricName === "Structure Quality");
			expect(structureQuality?.score).toBe(5);
			expect(structureQuality?.reasoning).toBe("Well connected.");
		});

		it("should return low scores for all-1s response", async () => {
			const mockClient = new MockLLMClient(
				createLLMResponse({
					taskCompletion: 1,
					structureQuality: 1,
					contentRelevance: 1,
				}),
			);

			const evaluator = new LlmAsJudgeEvaluator(mockClient);
			const context = createContext(createVerboseTree({ n1: { type: "inputTextNote" } }));

			const results = await evaluator.evaluate(context);
			expect(results).toHaveLength(3);

			for (const result of results) {
				expect(result.score).toBe(1);
			}
		});

		it("should return per-dimension scores for mixed response", async () => {
			const mockClient = new MockLLMClient(
				createLLMResponse({
					taskCompletion: 4,
					structureQuality: 5,
					contentRelevance: 2,
				}),
			);

			const evaluator = new LlmAsJudgeEvaluator(mockClient);
			const context = createContext(
				createVerboseTree(
					{ n1: { type: "inputTextNote" }, n2: { type: "llmAgent" } },
					{ e1: { source: "n1", target: "n2" } },
				),
			);

			const results = await evaluator.evaluate(context);
			expect(results).toHaveLength(3);

			const taskCompletion = results.find((r) => r.rubricName === "Task Completion");
			expect(taskCompletion?.score).toBe(4);

			const structureQuality = results.find((r) => r.rubricName === "Structure Quality");
			expect(structureQuality?.score).toBe(5);

			const contentRelevance = results.find((r) => r.rubricName === "Content Relevance");
			expect(contentRelevance?.score).toBe(2);
		});
	});

	describe("error handling", () => {
		it("should return error results for all dimensions when LLM client throws", async () => {
			const mockClient = new MockLLMClient("unused");
			jest.spyOn(mockClient, "chatCompletion").mockRejectedValue(new Error("Network error"));

			const evaluator = new LlmAsJudgeEvaluator(mockClient);
			const context = createContext(createVerboseTree());

			const results = await evaluator.evaluate(context);
			expect(results).toHaveLength(3);

			for (const result of results) {
				expect(result.score).toBe(0);
				expect(result.reasoning).toContain("Network error");
			}
		});

		it("should return fallback scores for all dimensions when response is unparseable", async () => {
			const mockClient = new MockLLMClient("This is not a valid evaluation response.");

			const evaluator = new LlmAsJudgeEvaluator(mockClient);
			const context = createContext(createVerboseTree({ n1: { type: "inputTextNote" } }));

			const results = await evaluator.evaluate(context);
			expect(results).toHaveLength(3);

			for (const result of results) {
				expect(result.score).toBe(0); // Fallback score
			}
		});
	});

	describe("prompt building", () => {
		it("should include output data in user prompt", () => {
			const treeState = createVerboseTree(
				{
					n1: { type: "inputTextNote", name: "Product ideas" },
					n2: { type: "llmAgent", name: "Agent" },
					n3: { type: "outputPowerPoint" },
				},
				{
					e1: { source: "n1", target: "n2" },
					e2: { source: "n2", target: "n3" },
				},
			);
			const context = createContext(treeState);

			const prompt = buildUserPrompt(context);

			expect(prompt).toContain("## Output");
			expect(prompt).toContain("inputTextNote");
			expect(prompt).toContain("llmAgent");
			expect(prompt).toContain("outputPowerPoint");
			expect(prompt).toContain("Product ideas");
			expect(prompt).toContain('"source": "n1"');
			expect(prompt).toContain('"target": "n2"');
		});

		it("should include input data when provided", () => {
			const context: EvaluationContext = {
				input: { prompt: "Create a board" },
				output: createVerboseTree({ n1: { type: "inputTextNote" } }),
				judgeModel: "gpt-5-chat-mini",
				rubrics: TEST_RUBRICS,
				logger: noopLogger,
			};

			const prompt = buildUserPrompt(context);

			expect(prompt).toContain("## Input");
			expect(prompt).toContain("Create a board");
			expect(prompt).toContain("## Output");
			expect(prompt).toContain("inputTextNote");
		});

		it("should handle empty output gracefully", () => {
			const context = createContext(createVerboseTree());
			const prompt = buildUserPrompt(context);

			expect(prompt).toContain("## Output");
		});

		it("should have system prompt with scoring scale and rubric dimensions", () => {
			const systemPrompt = buildSystemPrompt(TEST_RUBRICS);

			expect(systemPrompt).toContain("Task Completion");
			expect(systemPrompt).toContain("Structure Quality");
			expect(systemPrompt).toContain("Content Relevance");
			expect(systemPrompt).toContain("Score each dimension independently from 0 to 5");
			expect(systemPrompt).toContain("Score each dimension from 0 to 5");
			expect(systemPrompt).toContain("Scoring Scale");
		});
	});

	describe("MockLLMClient", () => {
		it("should record calls", async () => {
			const mockClient = new MockLLMClient("test response");
			const messages = [{ role: "user" as const, content: "hello" }];

			await mockClient.chatCompletion(messages);

			expect(mockClient.calls).toHaveLength(1);
			expect(mockClient.calls[0]).toEqual(messages);
		});

		it("should cycle through multiple responses", async () => {
			const mockClient = new MockLLMClient(["first", "second", "third"]);

			const r1 = await mockClient.chatCompletion([{ role: "user", content: "a" }]);
			const r2 = await mockClient.chatCompletion([{ role: "user", content: "b" }]);
			const r3 = await mockClient.chatCompletion([{ role: "user", content: "c" }]);

			expect(r1.content).toBe("first");
			expect(r2.content).toBe("second");
			expect(r3.content).toBe("third");
		});

		it("should repeat last response when exhausted", async () => {
			const mockClient = new MockLLMClient(["only"]);

			await mockClient.chatCompletion([{ role: "user", content: "a" }]);
			const r2 = await mockClient.chatCompletion([{ role: "user", content: "b" }]);

			expect(r2.content).toBe("only");
		});
	});

	describe("configurable scoring scales", () => {
		it("should parse multi-digit scores with defaultScale (0-10)", () => {
			const rubrics: Rubric[] = [{ name: "Quality", description: "Overall quality" }];
			const response = "Quality - Reasoning: Excellent work, Score: 9";
			const parsed = parseScores(response, rubrics, { min: 0, max: 10 });

			expect(parsed).toBeDefined();
			expect(parsed?.Quality.score).toBe(9);
		});

		it("should parse score of 10 with defaultScale", () => {
			const rubrics: Rubric[] = [{ name: "Quality", description: "Overall quality" }];
			const response = "Quality - Reasoning: Perfect, Score: 10";
			const parsed = parseScores(response, rubrics, { min: 0, max: 10 });

			expect(parsed).toBeDefined();
			expect(parsed?.Quality.score).toBe(10);
		});

		it("should clamp scores to the defaultScale range", () => {
			const rubrics: Rubric[] = [{ name: "Quality", description: "Overall quality" }];
			const response = "Quality - Reasoning: Over the top, Score: 9";
			const parsed = parseScores(response, rubrics); // default 0-5

			expect(parsed).toBeDefined();
			expect(parsed?.Quality.score).toBe(5); // Clamped to max
		});

		it("should use default 0-5 scale when no defaultScale provided", () => {
			const rubrics: Rubric[] = [{ name: "Quality", description: "Overall quality" }];
			const response = "Quality - Reasoning: Great, Score: 4";
			const parsed = parseScores(response, rubrics);

			expect(parsed).toBeDefined();
			expect(parsed?.Quality.score).toBe(4);
		});

		it("should include defaultScale range in system prompt", () => {
			const rubrics: Rubric[] = [{ name: "Quality", description: "Overall quality" }];
			const prompt = buildSystemPrompt(rubrics, undefined, { min: 0, max: 10 });

			expect(prompt).toContain("Score each dimension independently from 0 to 10");
			expect(prompt).toContain("Score: <0-10>");
		});

		it("should use 0-5 range in system prompt by default", () => {
			const prompt = buildSystemPrompt(TEST_RUBRICS);

			expect(prompt).toContain("Score each dimension independently from 0 to 5");
			expect(prompt).toContain("Score each dimension from 0 to 5");
			expect(prompt).toContain("Use the full range");
		});

		it("should use custom range in system prompt", () => {
			const rubrics: Rubric[] = [{ name: "Quality", description: "Overall quality" }];
			const prompt = buildSystemPrompt(rubrics, undefined, { min: 0, max: 10 });

			expect(prompt).toContain("Score each dimension from 0 to 10");
			expect(prompt).toContain("Use the full range");
		});
	});

	describe("optional rubrics", () => {
		it("should parse N/A response for optional rubrics", () => {
			const rubrics: Rubric[] = [
				{ name: "Task Completion", description: "How well done" },
				{ name: "Chart Quality", description: "Quality of charts", optional: true },
			];
			const response =
				"Task Completion - Reasoning: All done, Score: 5\nChart Quality - Reasoning: No charts present, Score: N/A";
			const parsed = parseScores(response, rubrics);

			expect(parsed).toBeDefined();
			expect(parsed?.["Task Completion"].score).toBe(5);
			expect(parsed?.["Chart Quality"].score).toBeUndefined();
			expect(parsed?.["Chart Quality"].reasoning).toBe("No charts present");
		});

		it("should treat missing optional rubric as N/A", () => {
			const rubrics: Rubric[] = [
				{ name: "Task Completion", description: "How well done" },
				{ name: "Chart Quality", description: "Quality of charts", optional: true },
			];
			const response = "Task Completion - Reasoning: All done, Score: 5";
			const parsed = parseScores(response, rubrics);

			expect(parsed).toBeDefined();
			expect(parsed?.["Task Completion"].score).toBe(5);
			expect(parsed?.["Chart Quality"].score).toBeUndefined();
		});

		it("should return undefined when required rubric is missing", () => {
			const rubrics: Rubric[] = [
				{ name: "Task Completion", description: "How well done" },
				{ name: "Structure", description: "Quality of structure" },
			];
			const response = "Task Completion - Reasoning: All done, Score: 5";
			const parsed = parseScores(response, rubrics);

			expect(parsed).toBeUndefined();
		});

		it("should include N/A option in response format for optional rubrics", () => {
			const rubrics: Rubric[] = [
				{ name: "Task Completion", description: "How well done" },
				{ name: "Chart Quality", description: "Quality of charts", optional: true },
			];
			const prompt = buildSystemPrompt(rubrics);

			expect(prompt).toContain("Score: <0-5 or N/A>");
			expect(prompt).toContain("*(may be N/A)*");
			expect(prompt).toContain("respond with Score: N/A");
		});

		it("should return null score on evaluator error for optional rubrics", async () => {
			const mockClient = new MockLLMClient("unused");
			jest.spyOn(mockClient, "chatCompletion").mockRejectedValue(new Error("Network error"));

			const evaluator = new LlmAsJudgeEvaluator(mockClient);
			const context: EvaluationContext = {
				output: {},
				judgeModel: "test",
				rubrics: [
					{ name: "Required", description: "Required metric" },
					{ name: "Optional", description: "Optional metric", optional: true },
				],
				logger: noopLogger,
			};

			const results = await evaluator.evaluate(context);
			const required = results.find((r) => r.rubricName === "Required");
			const optional = results.find((r) => r.rubricName === "Optional");

			expect(required?.score).toBe(0);
			expect(optional?.score).toBeUndefined();
		});
	});

	describe("multimodal image support", () => {
		describe("inferMediaType", () => {
			it("should return image/png for .png files", () => {
				expect(inferMediaType("/path/to/file.png")).toBe("image/png");
			});

			it("should return image/jpeg for .jpg files", () => {
				expect(inferMediaType("/path/to/file.jpg")).toBe("image/jpeg");
			});

			it("should return image/jpeg for .jpeg files", () => {
				expect(inferMediaType("/path/to/file.jpeg")).toBe("image/jpeg");
			});

			it("should return image/gif for .gif files", () => {
				expect(inferMediaType("/path/to/file.gif")).toBe("image/gif");
			});

			it("should return image/webp for .webp files", () => {
				expect(inferMediaType("/path/to/file.webp")).toBe("image/webp");
			});

			it("should throw for unsupported extensions", () => {
				expect(() => inferMediaType("/path/to/file.bmp")).toThrow(
					"Unsupported image extension",
				);
				expect(() => inferMediaType("/path/to/file.tif")).toThrow(
					"Unsupported image extension",
				);
			});
		});

		describe("resolveImages", () => {
			it("should return empty array when no images provided", () => {
				expect(resolveImages()).toEqual([]);
				expect(resolveImages([])).toEqual([]);
			});

			it("should resolve file path strings by reading from disk", () => {
				const tmpDir = mkdtempSync(path.join(tmpdir(), "eval-test-"));
				const imgPath = path.join(tmpDir, "slide.png");
				const fakeData = Buffer.from("fake-png-data");
				writeFileSync(imgPath, fakeData);

				try {
					const blocks = resolveImages([imgPath]);

					expect(blocks).toHaveLength(2); // header + image
					expect((blocks[0] as { type: "text"; text: string }).text).toContain("## Images");
					expect(blocks[1]).toEqual({
						type: "image",
						mediaType: "image/png",
						data: fakeData.toString("base64"),
					});
				} finally {
					rmSync(tmpDir, { recursive: true, force: true });
				}
			});

			it("should throw when file exceeds 5 MB size limit", () => {
				const tmpDir = mkdtempSync(path.join(tmpdir(), "eval-test-"));
				const imgPath = path.join(tmpDir, "huge.png");
				// Write a 6 MB file
				writeFileSync(imgPath, Buffer.alloc(6 * 1024 * 1024));

				try {
					expect(() => resolveImages([imgPath])).toThrow("exceeds");
				} finally {
					rmSync(tmpDir, { recursive: true, force: true });
				}
			});

			it("should resolve ImageBase64 objects directly", () => {
				const blocks = resolveImages([
					{ type: "base64", mediaType: "image/jpeg", data: "abc123" },
				]);

				expect(blocks).toHaveLength(2);
				expect((blocks[0] as { type: "text"; text: string }).text).toContain("## Images");
				expect(blocks[1]).toEqual({
					type: "image",
					mediaType: "image/jpeg",
					data: "abc123",
				});
			});

			it("should throw when base64 data exceeds 5 MB size limit", () => {
				// Create a base64 string representing >5 MB of data
				const largeData = Buffer.alloc(6 * 1024 * 1024).toString("base64");
				expect(() =>
					resolveImages([{ type: "base64", mediaType: "image/png", data: largeData }]),
				).toThrow("exceeds");
			});

			it("should label multiple images with index", () => {
				const blocks = resolveImages([
					{ type: "base64", mediaType: "image/png", data: "img1" },
					{ type: "base64", mediaType: "image/png", data: "img2" },
				]);

				expect(blocks).toHaveLength(5); // header + 2 labels + 2 images
				expect((blocks[0] as { type: "text"; text: string }).text).toContain("## Images");
				expect(blocks[1]).toEqual({ type: "text", text: "[Image 1 of 2]" });
				expect(blocks[2]).toEqual({ type: "image", mediaType: "image/png", data: "img1" });
				expect(blocks[3]).toEqual({ type: "text", text: "[Image 2 of 2]" });
				expect(blocks[4]).toEqual({ type: "image", mediaType: "image/png", data: "img2" });
			});
		});

		describe("buildUserPrompt with images", () => {
			it("should return string when no images", () => {
				const context = createContext(createVerboseTree({ n1: { type: "note" } }));
				const result = buildUserPrompt(context);
				expect(typeof result).toBe("string");
			});

			it("should return ContentBlock[] when images provided", () => {
				const context: EvaluationContext = {
					...createContext(createVerboseTree({ n1: { type: "note" } })),
					images: [{ type: "base64", mediaType: "image/png", data: "dGVzdA==" }],
				};

				const result = buildUserPrompt(context);
				expect(Array.isArray(result)).toBe(true);

				const blocks = result as ContentBlock[];
				// First block is text (input/output), then label, then image
				expect(blocks[0].type).toBe("text");
				const imageBlocks = blocks.filter((b) => b.type === "image");
				expect(imageBlocks).toHaveLength(1);
			});

			it("should include text data alongside images", () => {
				const context: EvaluationContext = {
					input: { prompt: "Create something" },
					output: { result: "done" },
					images: [{ type: "base64", mediaType: "image/png", data: "dGVzdA==" }],
					judgeModel: "gpt-5-chat-mini",
					rubrics: TEST_RUBRICS,
					logger: noopLogger,
				};

				const result = buildUserPrompt(context) as ContentBlock[];
				const textBlock = result[0];
				expect(textBlock.type).toBe("text");
				expect((textBlock as { type: "text"; text: string }).text).toContain("## Input");
				expect((textBlock as { type: "text"; text: string }).text).toContain("## Output");
			});
		});

		describe("evaluator with multimodal messages", () => {
			it("should pass ContentBlock[] content to LLM client when images present", async () => {
				const mockClient = new MockLLMClient(
					createLLMResponse({
						taskCompletion: 5,
						structureQuality: 4,
						contentRelevance: 5,
					}),
				);

				const evaluator = new LlmAsJudgeEvaluator(mockClient);
				const context: EvaluationContext = {
					...createContext(createVerboseTree({ n1: { type: "note" } })),
					images: [{ type: "base64", mediaType: "image/png", data: "dGVzdA==" }],
				};

				const results = await evaluator.evaluate(context);
				expect(results).toHaveLength(3);
				expect(results[0].score).toBe(5);

				// Verify the user message was multimodal
				const userMessage = mockClient.calls[0][1];
				expect(Array.isArray(userMessage.content)).toBe(true);
			});
		});
	});
});
