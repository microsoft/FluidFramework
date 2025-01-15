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
import type { DebugEvent } from "../../aiCollabApi.js";

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

describe("Debug Log Works as expected", () => {
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

		const debugLog: DebugEvent[] = [];

		await aiCollab({
			openAI: {
				client: new OpenAI({
					apiKey: OPENAI_API_KEY,
				}),
				modelName: "gpt-4o",
			},
			treeNode: view.root,
			prompt: {
				systemRoleContext: "You're a helpful AI assistant",
				userAsk:
					"Change the title to 'Hello World', remove the existing tasks and then create two new placeholder tasks",
			},
			limiters: {
				maxModelCalls: 10,
			},
			debugEventLogHandler: (event) => {
				// eslint-disable-next-line unicorn/no-null
				console.log(`Received event: ${JSON.stringify(event, null, 2)}`);
				debugLog.push(event);
			},
			planningStep: true,
			finalReviewStep: true,
		});

		debugger;

		assert.strictEqual(debugLog.length > 0, true);
		// assert.strictEqual(
		// 	debugLog.find(
		// 		(event) =>
		// 			event.eventName === "GENERATE_TREE_EDIT_LLM" &&
		// 			(event as GenerateTreeEditInitiatedDebugEvent).eventFlowStatus === "INITIATED",
		// 	),
		// 	true,
		// );

		// assert.strictEqual(response.errorMessage, "tokenLimitExceeded");
		// assert.strictEqual(response.tokensUsed.inputTokens >= inputTokenLimit, true);
	}).timeout(20000);
});
