/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
/*
 * The unit tests in this file purposefully exercise dynamically generated / stringified code paths.
 * We disable the TypeScript ESLint unsafe access rules here to keep the test code concise while still
 * validating runtime behaviors and messages of the EditResult objects returned by the agent.
 */

import {
	independentView,
	SchemaFactory,
	TreeViewConfiguration,
} from "@fluidframework/tree/alpha";

import { createContext, createTreeAgent, executeSemanticEditing } from "../agent.js";
import type {
	SharedTreeChatModel,
	TreeAgentChatMessage,
	TreeAgentChatResponse,
} from "../api.js";

const sf = new SchemaFactory(undefined);
const editToolName = "EditTreeTool";

describe("Context", () => {
	it("context provides helpers for editing", async () => {
		const sfLocal = new SchemaFactory("ContextHelpers");
		class Child extends sfLocal.object("Child", {
			value: sfLocal.required(sfLocal.string),
		}) {}
		class NumberMap extends sfLocal.map("NumberMap", sfLocal.number) {}
		class Parent extends sfLocal.object("Parent", {
			child: Child,
			values: NumberMap,
		}) {}
		const view = independentView(new TreeViewConfiguration({ schema: Parent }));
		view.initialize(
			new Parent({
				child: new Child({ value: "Initial" }),
				values: new NumberMap(new Map([["x", 1]])),
			}),
		);
		const context = createContext(view);
		assert.equal(context.root.child.value, "Initial");
		const createParent = context.create.Parent;
		assert.ok(createParent !== undefined, "Expected Parent constructor");
		const createChild = context.create.Child;
		assert.ok(createChild !== undefined, "Expected Child constructor");
		const replacementRoot = createParent({
			child: createChild({ value: "Created" }),
			values: new NumberMap(new Map([["y", 2]])),
		}) as Parent;
		context.root = replacementRoot;
		assert.equal(view.root.child.value, "Created");
		const isParent = context.is.Parent;
		assert.ok(isParent !== undefined, "Expected Parent type guard");
		assert.ok(isParent(view.root));
		assert.equal(context.isMap(view.root.values), true);
		assert.equal(context.isMap(new Map()), true);
		assert.equal(context.isMap({}), false);
		const parent = context.parent(view.root.child);
		assert.equal(parent, view.root);
		assert.equal(context.parent(view.root), undefined);
		const key = context.key(view.root.child);
		assert.equal(key, "child");
	});
});

/**
 * Helper to create a mock model that implements invoke() with a sequence of canned responses.
 */
function createMockInvokeModel(
	responses: TreeAgentChatResponse[],
	editToolNameValue: string = editToolName,
): SharedTreeChatModel & { invokeHistory: (readonly TreeAgentChatMessage[])[] } {
	let callIndex = 0;
	const invokeHistory: (readonly TreeAgentChatMessage[])[] = [];
	return {
		editToolName: editToolNameValue,
		invokeHistory,
		async invoke(history: readonly TreeAgentChatMessage[]): Promise<TreeAgentChatResponse> {
			invokeHistory.push([...history]);
			const response = responses[callIndex++];
			if (response === undefined) {
				throw new Error(`Mock model ran out of responses at call ${callIndex}`);
			}
			return response;
		},
	};
}

describe("createTreeAgent", () => {
	it("can apply a single edit", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }));
		view.initialize("Content");
		const model = createMockInvokeModel([
			{
				role: "tool_call",
				toolCallId: "c1",
				toolName: editToolName,
				toolArgs: { js: `context.root = "Edited";` },
			},
			{ role: "assistant", content: "Done editing" },
		]);
		const agent = createTreeAgent(model, view);
		const result = await agent.message("Edit it");
		assert.equal(result, "Done editing");
		assert.equal(view.root, "Edited");
		agent.dispose();
	});

	it("can apply multiple sequential edits", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }));
		view.initialize("Content");
		const model = createMockInvokeModel([
			{
				role: "tool_call",
				toolCallId: "c1",
				toolName: editToolName,
				toolArgs: { js: `context.root = "First";` },
			},
			{
				role: "tool_call",
				toolCallId: "c2",
				toolName: editToolName,
				toolArgs: { js: `context.root = "Second";` },
			},
			{ role: "assistant", content: "All done" },
		]);
		const agent = createTreeAgent(model, view);
		const result = await agent.message("Edit twice");
		assert.equal(result, "All done");
		assert.equal(view.root, "Second");
		agent.dispose();
	});

	it("handles edit errors and allows retry", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }));
		view.initialize("Content");
		const model = createMockInvokeModel([
			{
				role: "tool_call",
				toolCallId: "c1",
				toolName: editToolName,
				toolArgs: { js: `throw new Error("boom");` },
			},
			{
				role: "tool_call",
				toolCallId: "c2",
				toolName: editToolName,
				toolArgs: { js: `context.root = "Recovered";` },
			},
			{ role: "assistant", content: "Fixed it" },
		]);
		const agent = createTreeAgent(model, view);
		const result = await agent.message("Try editing");
		assert.equal(result, "Fixed it");
		assert.equal(view.root, "Recovered");
		agent.dispose();
	});

	it("limits the number of sequential edits", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }));
		view.initialize("Initial");
		const model = createMockInvokeModel([
			{
				role: "tool_call",
				toolCallId: "c1",
				toolName: editToolName,
				toolArgs: { js: `context.root = "One";` },
			},
			{
				role: "tool_call",
				toolCallId: "c2",
				toolName: editToolName,
				toolArgs: { js: `context.root = "Two";` },
			},
			{
				role: "tool_call",
				toolCallId: "c3",
				toolName: editToolName,
				toolArgs: { js: `context.root = "Three";` },
			},
			{ role: "assistant", content: "Gave up" },
		]);
		const agent = createTreeAgent(model, view, { maximumSequentialEdits: 2 });
		const result = await agent.message("Edit a lot");
		assert.equal(result, "Gave up");
		// Tree should NOT have merged because too many edits triggered rollback behavior
		assert.equal(view.root, "Initial");
		agent.dispose();
	});

	it("terminates if the model never returns an assistant response", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }));
		view.initialize("Initial");
		// Create many valid tool_call responses. The agent should terminate after exceeding the edit limit.
		const badResponses = Array.from({ length: 20 }, (_, i) => ({
			role: "tool_call" as const,
			toolCallId: `c${i}`,
			toolName: editToolName,
			toolArgs: { js: `context.root = "Edit ${i}";` },
		}));
		const model = createMockInvokeModel(badResponses);
		const agent = createTreeAgent(model, view, { maximumSequentialEdits: 2 });
		const result = await agent.message("Do something");
		assert(result.includes("failed to produce a response"));
		assert.equal(view.root, "Initial");
		agent.dispose();
	});

	it("merges on success, rolls back on failure", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }));
		view.initialize("Initial");
		// First edit succeeds, second fails → rollback
		const model = createMockInvokeModel([
			{
				role: "tool_call",
				toolCallId: "c1",
				toolName: editToolName,
				toolArgs: { js: `context.root = "Good";` },
			},
			{
				role: "tool_call",
				toolCallId: "c2",
				toolName: editToolName,
				toolArgs: { js: `throw new Error("boom");` },
			},
			{ role: "assistant", content: "Oops" },
		]);
		const agent = createTreeAgent(model, view);
		const result = await agent.message("Edit");
		assert.equal(result, "Oops");
		assert.equal(view.root, "Initial", "Tree should have been rolled back");
		agent.dispose();
	});

	it("does not roll back if failed edit is followed by successful edit", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }));
		view.initialize("Initial");
		const model = createMockInvokeModel([
			{
				role: "tool_call",
				toolCallId: "c1",
				toolName: editToolName,
				toolArgs: { js: `throw new Error("boom");` },
			},
			{
				role: "tool_call",
				toolCallId: "c2",
				toolName: editToolName,
				toolArgs: { js: `context.root = "Recovered";` },
			},
			{ role: "assistant", content: "Fixed" },
		]);
		const agent = createTreeAgent(model, view);
		const result = await agent.message("Edit");
		assert.equal(result, "Fixed");
		assert.equal(view.root, "Recovered");
		agent.dispose();
	});

	it("rejects models without invoke()", () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }));
		view.initialize("Content");
		const model: SharedTreeChatModel = {
			editToolName,
			invoke: undefined as never,
		};
		assert.throws(() => createTreeAgent(model, view), /invoke/);
	});

	it("rejects models without editToolName", () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }));
		view.initialize("Content");
		const model: SharedTreeChatModel = {
			async invoke() {
				return { role: "assistant", content: "nope" };
			},
		};
		assert.throws(() => createTreeAgent(model, view), /editToolName/);
	});

	it("runs custom editors", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }));
		view.initialize("Content");
		const model = createMockInvokeModel([
			{
				role: "tool_call",
				toolCallId: "c1",
				toolName: editToolName,
				toolArgs: { js: "Code" },
			},
			{ role: "assistant", content: "Done" },
		]);
		const agent = createTreeAgent(model, view, {
			editor: async (tree, js) => {
				const ctx = createContext(tree);
				assert.equal(ctx.root, "Content");
				assert.equal(js, "Code");
				ctx.root = "Edited";
			},
		});
		const result = await agent.message("Edit");
		assert.equal(result, "Done");
		assert.equal(view.root, "Edited");
		agent.dispose();
	});

	it("sends tree-changed notification between calls", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }));
		view.initialize("Initial");
		const model = createMockInvokeModel([
			{ role: "assistant", content: "First" },
			{ role: "assistant", content: "Second" },
		]);
		const agent = createTreeAgent(model, view);
		await agent.message("First query");
		// Mutate tree externally
		view.root = "ExternallyChanged";
		await agent.message("Second query");
		// The second message call should have the tree-changed system message in its history
		assert.ok(model.invokeHistory.length >= 2, "Expected at least 2 invoke calls");
		const secondHistory = model.invokeHistory[1];
		assert.notEqual(secondHistory, undefined);
		const treeChangedMsg = secondHistory?.find(
			(m) =>
				m.role === "system" && m.content.includes("The tree has changed since the last query"),
		);
		assert.ok(treeChangedMsg !== undefined, "Expected tree-changed system message");
		agent.dispose();
	});

	it("does not send tree-changed notification after agent's own edit", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }));
		view.initialize("Initial");
		const model = createMockInvokeModel([
			{
				role: "tool_call",
				toolCallId: "c1",
				toolName: editToolName,
				toolArgs: { js: `context.root = "AgentEdited";` },
			},
			{ role: "assistant", content: "Edited" },
			{ role: "assistant", content: "Second response" },
		]);
		const agent = createTreeAgent(model, view);
		await agent.message("Edit it");
		assert.equal(view.root, "AgentEdited");
		// Second call — no external change, only agent's own edit from the previous call
		await agent.message("Follow up");
		const secondHistory = model.invokeHistory[2];
		assert.notEqual(secondHistory, undefined);
		const treeChangedMsg = secondHistory?.find(
			(m) =>
				m.role === "system" && m.content.includes("The tree has changed since the last query"),
		);
		assert.equal(
			treeChangedMsg,
			undefined,
			"Should NOT have tree-changed notification after agent's own edit",
		);
		agent.dispose();
	});

	it("adds error to history when tool args have no single string value", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }));
		view.initialize("Initial");
		const model = createMockInvokeModel([
			{
				role: "tool_call",
				toolCallId: "c1",
				toolName: editToolName,
				toolArgs: { a: 1, b: 2 },
			},
			{ role: "assistant", content: "Gave up" },
		]);
		const agent = createTreeAgent(model, view);
		const result = await agent.message("Edit");
		assert.equal(result, "Gave up");
		assert.equal(view.root, "Initial", "Tree should not have changed");
		// Verify the error was added to history
		const lastHistory = model.invokeHistory[1];
		assert.notEqual(lastHistory, undefined);
		const errorMsg = lastHistory?.find(
			(m) =>
				m.role === "tool_result" && m.content.includes("Expected a single string argument"),
		);
		assert.ok(errorMsg !== undefined, "Expected error message in history");
		agent.dispose();
	});

	it("works with optional toolCallId (undefined)", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }));
		view.initialize("Content");
		const model = createMockInvokeModel([
			{
				role: "tool_call",
				toolName: editToolName,
				toolArgs: { js: `context.root = "Edited";` },
			},
			{ role: "assistant", content: "Done" },
		]);
		const agent = createTreeAgent(model, view);
		const result = await agent.message("Edit");
		assert.equal(result, "Done");
		assert.equal(view.root, "Edited");
		// Verify the tool_call message has no toolCallId
		const lastHistory = model.invokeHistory[1];
		assert.notEqual(lastHistory, undefined);
		const toolCallMsg = lastHistory?.find((m) => m.role === "tool_call");
		assert.ok(toolCallMsg !== undefined);
		assert.equal(
			(toolCallMsg as { toolCallId?: string }).toolCallId,
			undefined,
			"toolCallId should be undefined",
		);
		agent.dispose();
	});
});

// #endregion

// #region executeSemanticEditing tests

describe("executeSemanticEditing", () => {
	it("can apply a single edit and returns response string", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }));
		view.initialize("Content");
		const model = createMockInvokeModel([
			{
				role: "tool_call",
				toolCallId: "c1",
				toolName: editToolName,
				toolArgs: { js: `context.root = "Edited";` },
			},
			{ role: "assistant", content: "Done editing" },
		]);
		const response = await executeSemanticEditing(model, view, "Edit it");
		assert.equal(response, "Done editing");
		assert.equal(view.root, "Edited");
	});

	it("can apply multiple sequential edits", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }));
		view.initialize("Content");
		const model = createMockInvokeModel([
			{
				role: "tool_call",
				toolCallId: "c1",
				toolName: editToolName,
				toolArgs: { js: `context.root = "First";` },
			},
			{
				role: "tool_call",
				toolCallId: "c2",
				toolName: editToolName,
				toolArgs: { js: `context.root = "Second";` },
			},
			{ role: "assistant", content: "All done" },
		]);
		const response = await executeSemanticEditing(model, view, "Edit twice");
		assert.equal(response, "All done");
		assert.equal(view.root, "Second");
	});

	it("rolls back all edits when a later edit fails", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }));
		view.initialize("Initial");
		const model = createMockInvokeModel([
			{
				role: "tool_call",
				toolCallId: "c1",
				toolName: editToolName,
				toolArgs: { js: `context.root = "Good";` },
			},
			{
				role: "tool_call",
				toolCallId: "c2",
				toolName: editToolName,
				toolArgs: { js: `throw new Error("boom");` },
			},
			{ role: "assistant", content: "Oops" },
		]);
		const response = await executeSemanticEditing(model, view, "Edit");
		assert.equal(response, "Oops");
		// Query-level fork means all edits are rolled back when the last edit fails
		assert.equal(view.root, "Initial");
	});

	it("enforces maximumSequentialEdits", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }));
		view.initialize("Initial");
		const model = createMockInvokeModel([
			{
				role: "tool_call",
				toolCallId: "c1",
				toolName: editToolName,
				toolArgs: { js: `context.root = "One";` },
			},
			{
				role: "tool_call",
				toolCallId: "c2",
				toolName: editToolName,
				toolArgs: { js: `context.root = "Two";` },
			},
			{
				role: "tool_call",
				toolCallId: "c3",
				toolName: editToolName,
				toolArgs: { js: `context.root = "Three";` },
			},
			{ role: "assistant", content: "Gave up" },
		]);
		const response = await executeSemanticEditing(model, view, "Edit a lot", {
			maximumSequentialEdits: 2,
		});
		assert.equal(response, "Gave up");
		// Edit 3 was blocked, setting lastEditFailed — query-level fork rolls back all edits
		assert.equal(view.root, "Initial");
	});

	it("handles bad tool args gracefully", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }));
		view.initialize("Initial");
		const model = createMockInvokeModel([
			{
				role: "tool_call",
				toolCallId: "c1",
				toolName: editToolName,
				toolArgs: { a: 1, b: 2 },
			},
			{ role: "assistant", content: "Gave up" },
		]);
		const response = await executeSemanticEditing(model, view, "Edit");
		assert.equal(response, "Gave up");
		assert.equal(view.root, "Initial");
	});

	it("rejects models without invoke()", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }));
		view.initialize("Content");
		const model: SharedTreeChatModel = {
			editToolName,
			invoke: undefined as never,
		};
		await assert.rejects(async () => executeSemanticEditing(model, view, "Edit"), /invoke/);
	});

	it("rejects models without editToolName", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }));
		view.initialize("Content");
		const model: SharedTreeChatModel = {
			async invoke() {
				return { role: "assistant", content: "nope" };
			},
		};
		await assert.rejects(
			async () => executeSemanticEditing(model, view, "Edit"),
			/editToolName/,
		);
	});

	it("recovery after failed edit preserves all successful edits", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }));
		view.initialize("Initial");
		const model = createMockInvokeModel([
			{
				role: "tool_call",
				toolCallId: "c1",
				toolName: editToolName,
				toolArgs: { js: `throw new Error("boom");` },
			},
			{
				role: "tool_call",
				toolCallId: "c2",
				toolName: editToolName,
				toolArgs: { js: `context.root = "Recovered";` },
			},
			{ role: "assistant", content: "Fixed" },
		]);
		const response = await executeSemanticEditing(model, view, "Edit");
		assert.equal(response, "Fixed");
		assert.equal(view.root, "Recovered");
	});

	it("works with a simple assistant-only response (no edits)", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }));
		view.initialize("Content");
		const model = createMockInvokeModel([{ role: "assistant", content: "Just a response" }]);
		const response = await executeSemanticEditing(model, view, "Question");
		assert.equal(response, "Just a response");
		assert.equal(view.root, "Content");
	});
});

// #endregion
