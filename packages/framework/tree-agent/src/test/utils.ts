/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { appendFileSync, closeSync, mkdirSync, openSync } from "node:fs";

// eslint-disable-next-line import/no-internal-modules
import { oob, unreachableCase } from "@fluidframework/core-utils/internal";
// eslint-disable-next-line import/no-internal-modules
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils";
// eslint-disable-next-line import/no-internal-modules
import { UsageError } from "@fluidframework/telemetry-utils/internal";
// eslint-disable-next-line import/no-internal-modules
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import { type ImplicitFieldSchema, TreeViewConfiguration } from "@fluidframework/tree";
import {
	SharedTree,
	TreeAlpha,
	asTreeViewAlpha,
	type InsertableField,
	type InsertableTreeFieldFromImplicitField,
	type ReadableField,
	type TreeView,
	type UnsafeUnknownSchema,
	type VerboseTree,
	type VerboseTreeNode,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tree/internal";
import { ChatAnthropic } from "@langchain/anthropic";
// eslint-disable-next-line import/no-internal-modules
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";

import type { Log } from "../agent.js";
import { createEditingAgent } from "../editingAgent.js";
import { createFunctioningAgent } from "../functioningAgent.js";
import { fail, failUsage, getOrCreate } from "../utils.js";

/**
 * Validates that the error is a UsageError with the expected error message.
 */
export function validateUsageError(expectedErrorMsg: string | RegExp): (error: Error) => true {
	return (error: Error) => {
		assert(error instanceof UsageError);
		if (
			typeof expectedErrorMsg === "string"
				? error.message !== expectedErrorMsg
				: !expectedErrorMsg.test(error.message)
		) {
			throw new Error(
				`Unexpected assertion thrown\nActual: ${error.message}\nExpected: ${expectedErrorMsg}`,
			);
		}
		return true;
	};
}

/**
 * The LLM providers supported by {@link createLlmClient}.
 */
export type LlmProvider = "openai" | "anthropic" | "gemini";

/**
 * Creates a new instance of the LLM client based on the specified provider.
 */
export function createLlmClient(provider: LlmProvider): BaseChatModel {
	switch (provider) {
		case "openai": {
			return new ChatOpenAI({
				model: "o4-mini",
				apiKey:
					process.env.OPENAI_API_KEY ??
					failUsage("Missing OPENAI_API_KEY environment variable"),
				reasoningEffort: "high",
				maxTokens: 20000,
				metadata: {
					modelName: "o3 Mini",
				},
			});
		}
		case "anthropic": {
			return new ChatAnthropic({
				model: "claude-3-7-sonnet-20250219",
				apiKey:
					process.env.ANTHROPIC_API_KEY ??
					failUsage("Missing ANTHROPIC_API_KEY environment variable"),
				thinking: { type: "enabled", budget_tokens: 10000 },
				maxTokens: 20000,
				metadata: {
					modelName: "Claude 3.7 Sonnet",
				},
			});
		}
		case "gemini": {
			return new ChatGoogleGenerativeAI({
				model: "gemini-2.5-pro-exp-03-25",
				apiKey:
					process.env.GEMINI_API_KEY ??
					failUsage("Missing GOOGLE_API_KEY environment variable"),
				maxOutputTokens: 20000,
				metadata: {
					modelName: "Gemini 2.5 Pro Exp",
				},
			});
		}
		default: {
			unreachableCase(provider);
		}
	}
}

/**
 * The type of LLM editing to leverage.
 */
export type LlmEditingType = "editing" | "functioning";

/**
 * Queries the LLM with the specified prompt and logs the results to a file.
 * @remarks Use the following environment variables to set the LLM API keys:
 * - `OPENAI_API_KEY` for OpenAI
 * - `ANTHROPIC_API_KEY` for Anthropic
 * - `GEMINI_API_KEY` for Gemini
 */
export async function queryDomain<TRoot extends ImplicitFieldSchema>(
	schema: TRoot,
	initialTree: InsertableTreeFieldFromImplicitField<TRoot>,
	provider: LlmProvider,
	editingType: LlmEditingType,
	prompt: string,
	options?: {
		domainHints?: string;
		treeToString?: (root: ReadableField<TRoot>) => string;
		readonly log?: Log;
	},
): Promise<TreeView<TRoot>> {
	const tree = SharedTree.getFactory().create(
		new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
		"tree",
	);
	const view = tree.viewWith(new TreeViewConfiguration({ schema }));
	view.initialize(initialTree);
	const client = createLlmClient(provider);
	const createAgent = editingType === "editing" ? createEditingAgent : createFunctioningAgent;

	const agent = createAgent(client, asTreeViewAlpha(view), {
		log: options?.log,
		domainHints: options?.domainHints,
		treeToString: options?.treeToString,
	});

	await agent.query(prompt);
	return view;
}

/**
 * TODO
 */
export interface LLMIntegrationTest<TRoot extends ImplicitFieldSchema | UnsafeUnknownSchema> {
	readonly name: string;
	readonly schema: TRoot;
	readonly initialTree: () => InsertableField<TRoot>;
	readonly prompt: string;
	readonly expected: ScorableVerboseTree;
	readonly options?: {
		readonly domainHints?: string;
		readonly treeToString?: (root: ReadableField<TRoot>) => string;
		readonly log?: Log;
	};
}

interface TestResult {
	readonly name: string;
	readonly provider: LlmProvider;
	readonly editingType: LlmEditingType;
	readonly score: number;
	readonly duration: number;
}

const resultsFolderPath = "./src/test/integration-test-results";

function formatDate(date: Date): string {
	return date
		.toLocaleString("en-US", {
			timeZone: "America/Los_Angeles",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false,
		})
		.replace(/[\s,/:]/g, "-");
}

/**
 * TODO
 */
export function describeIntegrationTests(
	tests: LLMIntegrationTest<UnsafeUnknownSchema>[],
): void {
	describe(`LLM integration tests`, () => {
		const results: TestResult[] = [];
		let startTime: Date | undefined;
		before(() => {
			startTime = new Date();
			mkdirSync(`${resultsFolderPath}/${formatDate(startTime)}`, { recursive: true });
		});

		after(() => {
			const filteredResults = results.filter((r) => r.name !== "");
			assert(startTime !== undefined, "Expected startTime to be set");
			let table = "| Test Name | Provider | Editing Type | Score | Elapsed Time (seconds) |\n";
			table += "| --- | --- | --- | ---:| ---:|\n";
			for (const result of filteredResults) {
				table += `| ${result.name} | ${result.provider} | ${result.editingType} | ${(result.score * 100).toFixed(2)}% | ${Math.ceil(result.duration / 1000)} |\n`;
			}
			const resultsFile = openSync(
				`${resultsFolderPath}/${formatDate(startTime)}/results.md`,
				"a",
			);
			appendFileSync(resultsFile, "# Results\n\n", { encoding: "utf8" });
			appendFileSync(
				resultsFile,
				`Total score: ${((filteredResults.reduce((a, b) => a + b.score, 0) / filteredResults.length) * 100).toFixed(2)}%\n\n`,
			);
			appendFileSync(resultsFile, "## Test Cases\n\n", { encoding: "utf8" });
			appendFileSync(resultsFile, table, { encoding: "utf8" });
			closeSync(resultsFile);
		});

		// Group tests by domain, in case they were not already ordered that way in the test list.
		const groups = new Map<unknown, LLMIntegrationTest<UnsafeUnknownSchema>[]>();
		for (const test of tests) {
			getOrCreate(groups, test.schema, () => []).push(test);
		}
		const grouped = [...groups.values()].flat();

		it("RUN ALL (in parallel)", async () => {
			const promises: Promise<void>[] = [];
			for (const editingType of ["editing", "functioning"] as const) {
				for (const test of grouped) {
					for (const provider of ["openai", "anthropic", "gemini"] as const) {
						const result = {
							name: test.name,
							provider,
							editingType,
							score: 0,
							duration: 0,
						} satisfies TestResult;
						results.push(result);
						promises.push(runTest(test, provider, editingType, result));
					}
				}
			}
			await handleAllSettledResults(promises);
		});

		for (const editingType of ["editing", "functioning"] as const) {
			describe(editingType === "editing"
				? "editing via DSL"
				: "editing via generated code", () => {
				describe("sorted by scenario", () => {
					it("RUN ALL (in parallel)", async () => {
						const promises: Promise<void>[] = [];
						for (const test of grouped) {
							for (const provider of ["openai", "anthropic", "gemini"] as const) {
								const result = {
									name: test.name,
									provider,
									editingType,
									score: 0,
									duration: 0,
								} satisfies TestResult;
								results.push(result);
								promises.push(runTest(test, provider, editingType, result));
							}
						}
						await handleAllSettledResults(promises);
					});
					for (const test of grouped) {
						describe(test.name, () => {
							it("RUN ALL (in parallel)", async () => {
								const promises: Promise<void>[] = [];
								for (const provider of ["openai", "anthropic", "gemini"] as const) {
									const result = {
										name: test.name,
										provider,
										editingType,
										score: 0,
										duration: 0,
									} satisfies TestResult;
									results.push(result);
									promises.push(runTest(test, provider, editingType, result));
								}
								await handleAllSettledResults(promises);
							});
							for (const provider of ["openai", "anthropic", "gemini"] as const) {
								it(`via ${provider}`, async () => {
									const result = {
										name: test.name,
										provider,
										editingType,
										score: 0,
										duration: 0,
									} satisfies TestResult;
									results.push(result);
									await runTest(test, provider, editingType, result);
								});
							}
						});
					}
				});

				describe("sorted by provider", () => {
					it("RUN ALL (in parallel)", async () => {
						const promises: Promise<void>[] = [];
						for (const provider of ["openai", "anthropic", "gemini"] as const) {
							for (const test of grouped) {
								const result = {
									name: test.name,
									provider,
									editingType,
									score: 0,
									duration: 0,
								} satisfies TestResult;
								results.push(result);
								promises.push(runTest(test, provider, editingType, result));
							}
						}
						await handleAllSettledResults(promises);
					});
					for (const provider of ["openai", "anthropic", "gemini"] as const) {
						describe(`via ${provider}`, () => {
							it("RUN ALL (in parallel)", async () => {
								const promises: Promise<void>[] = [];
								for (const test of grouped) {
									const result = {
										name: test.name,
										provider,
										editingType,
										score: 0,
										duration: 0,
									} satisfies TestResult;
									results.push(result);
									promises.push(runTest(test, provider, editingType, result));
								}
								await handleAllSettledResults(promises);
							});
							for (const test of grouped) {
								it(test.name, async () => {
									const result = {
										name: test.name,
										provider,
										editingType,
										score: 0,
										duration: 0,
									} satisfies TestResult;
									results.push(result);
									await runTest(test, provider, editingType, result);
								});
							}
						});
					}
				});
			});
		}

		async function runTest(
			test: LLMIntegrationTest<UnsafeUnknownSchema>,
			provider: LlmProvider,
			editingType: LlmEditingType,
			result: { score: number; duration: number },
		): Promise<void> {
			assert(startTime !== undefined, "Expected startTime to be set");
			const { name, schema, initialTree, prompt, expected, options } = test;
			const fd = openSync(
				`${resultsFolderPath}/${formatDate(startTime)}/${name}-${provider}-${editingType}.md`,
				"w",
			);
			const view = await queryDomain(
				schema as unknown as ImplicitFieldSchema, // TODO: typing
				initialTree() as never, // TODO: typing
				provider,
				editingType,
				prompt,
				{
					domainHints: options?.domainHints,
					treeToString: options?.treeToString,
					log: (text) => {
						appendFileSync(fd, text, { encoding: "utf8" });
					},
				},
			);
			result.duration = Date.now() - startTime.getTime();
			closeSync(fd);

			if (view.root === undefined) {
				result.score = expected === undefined ? 1 : 0;
			} else {
				const actualVerbose = TreeAlpha.exportVerbose(view.root) as VerboseTree<never>;
				result.score = scoreTree(expected, actualVerbose, actualVerbose);
			}
		}
	});
}

/**
 * TODO
 */
export const scoreSymbol = Symbol("Scope");

/**
 * TODO
 */
export type ScorableVerboseTreeNode = Partial<Pick<VerboseTreeNode<never>, "type">> & {
	fields?: ScorableVerboseTree[] | Record<string, ScorableVerboseTree>;
} & {
	[scoreSymbol]?: (actual: VerboseTreeNode<never>, actualTree: VerboseTree<never>) => number;
};

/**
 * TODO
 */
export type ScorableVerboseTree = VerboseTree<never> | ScorableVerboseTreeNode;

function hasScoreSymbol(
	node: VerboseTreeNode<never> | ScorableVerboseTreeNode,
): node is ScorableVerboseTreeNode & {
	[scoreSymbol]: (actual: VerboseTreeNode<never>, actualTree: VerboseTree<never>) => number;
} {
	return scoreSymbol in node;
}

function scoreTree(
	expected: ScorableVerboseTree,
	actual: VerboseTree<never>,
	actualTree: VerboseTree<never>,
): number {
	if (isFluidHandle(expected) || isFluidHandle(actual)) {
		return expected === actual ? 1 : 0;
	}

	switch (typeof expected) {
		case "string":
		case "number":
		case "boolean":
		default: {
			return expected === actual ? 1 : 0;
		}
		case "object": {
			if (expected === null || actual === null) {
				return expected === actual ? 1 : 0;
			}
			if (typeof actual !== "object") {
				return 0;
			}
			if (hasScoreSymbol(expected)) {
				if (expected.type !== undefined && expected.type !== actual.type) {
					return 0;
				}
				let score = 1;
				if (expected.fields !== undefined) {
					score = scoreFields(expected.fields, actual.fields, actualTree);
					if (score < Number.EPSILON) {
						return 0;
					}
				}
				return score * expected[scoreSymbol](actual, actualTree);
			}
			if (expected.type !== actual.type) {
				return 0;
			}
			return scoreFields(expected.fields, actual.fields, actualTree);
		}
	}
}

function scoreFields(
	expected: ScorableVerboseTreeNode["fields"],
	actual: VerboseTreeNode<never>["fields"],
	actualTree: VerboseTree<never>,
): number {
	if (expected === undefined) {
		return 0;
	}

	let score = 1;

	if (Array.isArray(expected)) {
		if (!Array.isArray(actual)) {
			return 0;
		}
		if (expected.length !== actual.length) {
			return 0;
		}
		for (let i = 0; i < expected.length; i++) {
			score *= scoreTree(expected[i] ?? oob(), actual[i] ?? oob(), actualTree);
			if (score < Number.EPSILON) {
				return 0;
			}
		}
	} else {
		if (Array.isArray(actual)) {
			return 0;
		}
		const expectedKeys = Reflect.ownKeys(expected)
			.filter((k): k is string =>
				typeof k === "string" ? true : fail("Encountered unexpected symbol key"),
			)
			.sort();
		const actualKeys = Reflect.ownKeys(actual)
			.filter((k): k is string =>
				typeof k === "string" ? true : fail("Encountered unexpected symbol key"),
			)
			.sort();
		if (expectedKeys.length !== actualKeys.length) {
			return 0;
		}
		for (let i = 0; i < expectedKeys.length; i++) {
			const expectedField = expected[expectedKeys[i] ?? oob()];
			const actualField = actual[actualKeys[i] ?? oob()];
			if (expectedField === undefined || actualField === undefined) {
				return 0;
			}
			score *= scoreTree(expectedField, actualField, actualTree);
			if (score < Number.EPSILON) {
				return 0;
			}
		}
	}

	return score;
}

async function handleAllSettledResults(promises: Promise<unknown>[]): Promise<void> {
	const results = await Promise.allSettled(promises);
	const errors = results
		.filter((result): result is PromiseRejectedResult => result.status === "rejected")
		.map((result) => result.reason as unknown);

	if (errors.length > 0) {
		throw new Error(`Multiple errors occurred: ${errors.join("; ")}`);
	}
}
