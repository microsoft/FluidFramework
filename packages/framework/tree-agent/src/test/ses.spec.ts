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

	it("returns a code error when SES blocks the generated code", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }), {});
		view.initialize("Initial");
		const evaluateEdit = await createSesEditEvaluator({
			lockdownOptions: {
				consoleTaming: "unsafe", // Allow test framework to patch console
				errorTaming: "unsafe", // Keep full stacks for debugging
				stackFiltering: "verbose", // Richer stacks
			},
		});
		const model: SharedTreeChatModel = {
			editToolName: "EditTreeTool",
			async query({ edit }) {
				const editResult = await edit("Object.prototype.polluted = 'hacked!';");
				assert.equal(editResult.type, "codeError", editResult.message);
				return editResult.message;
			},
		};

		const agent = new SharedTreeSemanticAgent(model, view, { evaluateEdit });
		const response = await agent.query("Attempt forbidden edit");
		assert.match(response, /is not extensible/i);
		assert.equal(view.root, "Initial", "Tree should not change after SES rejection");
	});
});
