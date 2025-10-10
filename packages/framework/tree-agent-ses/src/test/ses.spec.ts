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
import { SharedTreeSemanticAgent } from "@fluidframework/tree-agent/alpha";
import type { SharedTreeChatModel } from "@fluidframework/tree-agent/alpha";

import { createSesEditExecutor } from "../executor.js";

const sf = new SchemaFactory(undefined);

// This test is skipped to avoid SES lockdown side effects in global CI runs. Enable locally to validate.
describe.skip("SES edit executor", () => {
	it("prevents collision with reserved globals", () => {
		assert.throws(
			() =>
				createSesEditExecutor({
					compartmentOptions: {
						globals: new Map([["context", {}]]),
					},
				}),
			/context.*reserved/,
		);
	});

	it("can be generated multiple times without error", () => {
		createSesEditExecutor({ lockdownOptions });
		createSesEditExecutor({ lockdownOptions });
	});

	it("passes globals to the compartment", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }), {});
		view.initialize("Initial");
		const executeEdit = createSesEditExecutor({
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
		const executeEdit = createSesEditExecutor({ lockdownOptions });
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

const lockdownOptions = {
	consoleTaming: "unsafe",
	errorTaming: "unsafe",
	stackFiltering: "verbose",
} as const;
