/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	SchemaFactory,
	TreeViewConfiguration,
	independentView,
} from "@fluidframework/tree/alpha";

import { SharedTreeSemanticAgent } from "../agent.js";
import type { SharedTreeChatModel } from "../api.js";
import { createSesEditEvaluator } from "../ses.js";

const sf = new SchemaFactory(undefined);

// This test is skipped in order to avoid the SES import and lockdown side effects of `createSesEditEvaluator` from impacting other tests (e.g. when all tests are run during CI).
// Enable it manually to verify the SES-based evaluator works as expected, then re-skip it before checking in.
describe.skip("SES edit evaluator", () => {
	it("prevents collision with reserved globals", async () => {
		await assert.rejects(
			createSesEditEvaluator({
				compartmentOptions: {
					globals: new Map([["context", {}]]),
				},
			}),
			{
				message: /context.*reserved/,
			},
		);
	});

	it("can be generated multiple times without error", async () => {
		await createSesEditEvaluator({ lockdownOptions });
		await createSesEditEvaluator({ lockdownOptions });
	});

	it("passes globals to the compartment", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }), {});
		view.initialize("Initial");
		const executeEdit = await createSesEditEvaluator({
			lockdownOptions,
			compartmentOptions: {
				globals: new Map([["extraGlobal", "globalValue"]]),
			},
		});
		const model: SharedTreeChatModel = {
			editToolName: "EditTreeTool",
			async query({ edit }) {
				const editResult = await edit("context.root = extraGlobal");
				assert.equal(editResult.type, "success", editResult.message);
				return editResult.message;
			},
		};

		const agent = new SharedTreeSemanticAgent(model, view, { executeEdit });
		await agent.query("");
		assert.equal(view.root, "globalValue");
	});

	it("returns a code error when SES blocks the generated code", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }), {});
		view.initialize("Initial");
		const executeEdit = await createSesEditEvaluator({
			lockdownOptions,
		});
		const model: SharedTreeChatModel = {
			editToolName: "EditTreeTool",
			async query({ edit }) {
				const editResult = await edit("Object.prototype.polluted = 'hacked!';");
				assert.equal(editResult.type, "executionError", editResult.message);
				return editResult.message;
			},
		};

		const agent = new SharedTreeSemanticAgent(model, view, { executeEdit });
		const response = await agent.query("Attempt forbidden edit");
		assert.match(response, /is not extensible/i);
		assert.equal(view.root, "Initial", "Tree should not change after SES rejection");
	});
});

/**
 * Used to configure SES lockdown for tests.
 * @remarks This e.g. prevents mocha from failing during test cleanup as it messes with the console.
 */
const lockdownOptions = {
	consoleTaming: "unsafe", // Allow test framework to patch console
	errorTaming: "unsafe", // Keep full stacks for debugging
	stackFiltering: "verbose", // Richer stacks
} as const;
