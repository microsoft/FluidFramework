/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

// eslint-disable-next-line import/no-internal-modules
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
// eslint-disable-next-line import/no-internal-modules
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import {
	SharedTree,
	SchemaFactory,
	TreeViewConfiguration,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tree/internal";
import { OpenAI } from "openai";

import { aiCollab } from "../../aiCollab.js";

const sf = new SchemaFactory("TestApp");
class TestAppSchema extends sf.object("TestAppSchema", {
	title: sf.string,
	tasks: sf.array(
		sf.object("Task", {
			title: sf.string,
			description: sf.string,
		}),
	),
}) {}

const factory = SharedTree.getFactory();

const OPENAI_API_KEY = ""; // DON'T COMMIT THIS

describe.skip("Token limits work as expected", () => {
	it("Should not allow more than allowed input token limit", async () => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: TestAppSchema }));
		view.initialize({
			title: "This is a group of tasks",
			tasks: [
				{
					title: "Task 1",
					description: "This is the first task",
				},
				{
					title: "Task 2",
					description: "This is the second task",
				},
			],
		});

		const inputTokenLimit = 500;
		const response = await aiCollab({
			treeView: view,
			openAI: {
				client: new OpenAI({
					apiKey: OPENAI_API_KEY,
				}),
				options: { model: "gpt-4o" },
			},
			treeNode: view.root,
			prompt: {
				systemRoleContext: "You're a helpful AI assistant",
				userAsk:
					"Change the title to 'Hello World', remove the existing tasks and then create two new sample tasks",
			},
			limiters: {
				maxModelCalls: 10,
				tokenLimits: {
					inputTokens: inputTokenLimit,
				},
			},
		});
		assert.strictEqual(response.status, "partial-failure");
		assert.strictEqual(response.errorMessage, "tokenLimitExceeded");
		assert.strictEqual(response.tokensUsed.inputTokens >= inputTokenLimit, true);
	}).timeout(20000);

	it("Should not allow more than allowed output token limit", async () => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: TestAppSchema }));
		view.initialize({
			title: "This is a group of tasks",
			tasks: [
				{
					title: "Task 1",
					description: "This is the first task",
				},
				{
					title: "Task 2",
					description: "This is the second task",
				},
			],
		});

		const outputTokenLimit = 100;

		const response = await aiCollab({
			treeView: view,
			openAI: {
				client: new OpenAI({
					apiKey: OPENAI_API_KEY,
				}),
				options: { model: "gpt-4o" },
			},
			treeNode: view.root,
			prompt: {
				systemRoleContext: "You're a helpful AI assistant",
				userAsk:
					"Change the title to 'Hello World', remove the existing tasks and then create two new sample tasks",
			},
			limiters: {
				maxModelCalls: 10,
				tokenLimits: {
					outputTokens: outputTokenLimit,
				},
			},
		});
		assert.strictEqual(response.status, "partial-failure");
		assert.strictEqual(response.errorMessage, "tokenLimitExceeded");
		assert.strictEqual(response.tokensUsed.outputTokens >= outputTokenLimit, true);
	}).timeout(20000);
});
