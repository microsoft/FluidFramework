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
import { executeSemanticEditing } from "@fluidframework/tree-agent/alpha";
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
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }));
		view.initialize("Initial");
		const editor = createSesEditExecutor({
			lockdownOptions,
			compartmentOptions: {
				globals: new Map([["extraGlobal", "globalValue"]]),
			},
		});
		const model: SharedTreeChatModel = {
			editToolName: "EditTreeTool",
			async invoke(history) {
				const lastMessage = history.at(-1);
				if (lastMessage?.role === "tool_result") {
					return { role: "assistant", content: lastMessage.content };
				}
				return {
					role: "tool_call",
					toolName: "EditTreeTool",
					toolArgs: { code: "context.root = extraGlobal" },
				};
			},
		};

		await executeSemanticEditing(model, view, "", { editor });
		assert.equal(view.root, "globalValue");
	});

	it("returns a code error when SES blocks the generated code", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }));
		view.initialize("Initial");
		const editor = createSesEditExecutor({ lockdownOptions });
		const model: SharedTreeChatModel = {
			editToolName: "EditTreeTool",
			async invoke(history) {
				const lastMessage = history.at(-1);
				if (lastMessage?.role === "tool_result") {
					return { role: "assistant", content: lastMessage.content };
				}
				return {
					role: "tool_call",
					toolName: "EditTreeTool",
					toolArgs: { code: "Object.prototype.polluted = 'hacked!';" },
				};
			},
		};

		const response = await executeSemanticEditing(model, view, "Attempt forbidden edit", {
			editor,
		});
		assert.match(response, /is not extensible/i);
		assert.equal(view.root, "Initial", "Tree should not change after SES rejection");
	});
});

const lockdownOptions = {
	consoleTaming: "unsafe",
	errorTaming: "unsafe",
	stackFiltering: "verbose",
} as const;
