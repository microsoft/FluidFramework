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

import { SharedTreeSemanticAgent } from "../agent.js";
import type { EditResult, SharedTreeChatModel } from "../api.js";

const sf = new SchemaFactory(undefined);
const editToolName = "EditTreeTool";

describe("Semantic Agent", () => {
	it("returns messages from queries", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }), {});
		view.initialize("Content");
		const model: SharedTreeChatModel = {
			async query(message) {
				assert.equal(message.text, "Query");
				return "Response";
			},
		};
		const agent = new SharedTreeSemanticAgent(model, view);
		assert.equal(await agent.query("Query"), "Response");
	});

	it("can apply an edit from a query", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }), {});
		view.initialize("Content");
		const code = `context.root = "Edited";`;
		const model: SharedTreeChatModel = {
			editToolName,
			async query({ edit }) {
				const result = await edit(code);
				assert(result.type === "success", result.message);
				return result.message;
			},
		};
		const agent = new SharedTreeSemanticAgent(model, view);
		const response = await agent.query("Query");
		assert.ok(response.includes("the new state of the tree is"));
		assert.ok(response.includes("Edited"));
		assert.equal(view.root, "Edited");
	});

	it("can apply multiple edits from a query", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }), {});
		view.initialize("Content");
		let editCount = 0;
		const firstEdit = `
			context.root = "First Edit";
		`;
		const secondEdit = `
			context.root = "Second Edit";
		`;
		const model: SharedTreeChatModel = {
			editToolName,
			async query({ edit }) {
				editCount++;
				if (editCount === 1) {
					const result1 = await edit(firstEdit);
					assert(result1.type === "success", result1.message);
					const result2 = await edit(secondEdit);
					assert(result2.type === "success", result2.message);
					return result2.message;
				}
				return "No edits";
			},
		};
		const agent = new SharedTreeSemanticAgent(model, view);
		const response = await agent.query("Query");
		assert.ok(response.includes("the new state of the tree is"));
		assert.ok(response.includes("Second Edit"));
		assert.equal(view.root, "Second Edit");
	});

	it("does not allow editing if edit function name is not provided", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }), {});
		view.initialize("Content");
		const model: SharedTreeChatModel = {
			async query({ edit }) {
				const result = await edit(`context.root = "Edited";`);
				assert.equal(result.type, "disabledError", "Expected edit to be disabled");
				return result.message;
			},
		};
		const agent = new SharedTreeSemanticAgent(model, view);
		const response = await agent.query("Query");
		assert.ok(response.includes("Editing is not enabled"));
		assert.equal(view.root, "Content", "Tree should not have changed");
	});

	it("runs validation on edit code", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }), {});
		view.initialize("Orig");
		let callCount = 0;
		const model: SharedTreeChatModel = {
			editToolName,
			async query({ edit }) {
				callCount++;
				if (callCount === 1) {
					const validLooking = `context.root = "New";`;
					const result = await edit(validLooking);
					assert.equal(result.type, "validationError", result.message);
					return result.message;
				}
				return "Second ok";
			},
		};
		const agent = new SharedTreeSemanticAgent(model, view, {
			validateEdit: () => {
				throw new Error("The code was trying to hack the mainframe!");
			},
		});
		const response = await agent.query("First");
		assert.ok(response.includes("mainframe"));
		// Check that a subsequent query still works.
		assert.equal(view.root, "Orig", "Tree should not have changed after failed validation");
		assert.equal(await agent.query("Second"), "Second ok");
	});

	it("handles malformed edit code", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }), {});
		view.initialize("Content");
		let callCount = 0;
		const model: SharedTreeChatModel = {
			editToolName,
			async query({ edit }) {
				callCount++;
				if (callCount === 1) {
					const result1 = await edit("const ; x = 1, for else");
					assert.equal(result1.type, "executionError", result1.message);
					return result1.message;
				}
				return "Recovered";
			},
		};
		const agent = new SharedTreeSemanticAgent(model, view);
		const response1 = await agent.query("First");
		assert.ok(response1.includes("Unexpected token"));
		// Check that a subsequent query still works.
		assert.equal(await agent.query("Second"), "Recovered");
	});

	it("handles edit code that causes runtime errors", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }), {});
		view.initialize("Content");
		let callCount = 0;
		const model: SharedTreeChatModel = {
			editToolName,
			async query({ edit }) {
				callCount++;
				if (callCount === 1) {
					const result = await edit(`throw new Error("boom");`);
					assert.equal(result.type, "executionError", result.message);
					return result.message;
				}
				// On second query perform successful edit to prove recovery.
				const result2 = await edit(`context.root = "Recovered";`);
				assert.equal(result2.type, "success", result2.message);
				return "Recovered";
			},
		};
		const agent = new SharedTreeSemanticAgent(model, view);
		const response = await agent.query("First");
		assert.ok(response.includes("boom"));
		// Tree should be unchanged.
		assert.equal(view.root, "Content");
		assert.equal(await agent.query("Second"), "Recovered");
		assert.equal(view.root, "Recovered");
	});

	it("limits the number of sequential edits", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }), {});
		view.initialize("Initial");
		let callCount = 0;
		const model: SharedTreeChatModel = {
			editToolName,
			async query({ edit }) {
				callCount++;
				if (callCount === 1) {
					const result1 = await edit(`context.root = "One";`);
					assert.equal(result1.type, "success", result1.message);
					const result2 = await edit(`context.root = "Two";`);
					assert.equal(result2.type, "success", result2.message);
					const result3 = await edit(`context.root = "Three";`);
					assert.equal(result3.type, "tooManyEditsError", result3.message);
					return result3.message;
				}
				// On second query should be able to edit again.
				const result = await edit(`context.root = "Recovered";`);
				assert.equal(result.type, "success", result.message);
				return "Recovered";
			},
		};
		const agent = new SharedTreeSemanticAgent(model, view, {
			maximumSequentialEdits: 2,
		});
		const response = await agent.query("First");
		assert.ok(response.includes("maximum"));
		assert.equal(view.root, "Initial");
		assert.equal(await agent.query("Second"), "Recovered");
	});

	it("does not allow editing after query completes", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }), {});
		view.initialize("Initial");
		let stolenEditCallback: ((js: string) => Promise<EditResult>) | undefined;
		const model: SharedTreeChatModel = {
			editToolName,
			async query({ edit }) {
				stolenEditCallback = edit;
				return "They'll never know!";
			},
		};
		const agent = new SharedTreeSemanticAgent(model, view, {
			maximumSequentialEdits: 2,
		});
		const response = await agent.query("First");
		assert.equal(response, "They'll never know!");
		assert(stolenEditCallback !== undefined, "Expected to have stolen the edit callback");
		const editResult = await stolenEditCallback(`context.root = 'Edit too late';`);
		assert.equal(editResult.type, "expiredError", editResult.message);
		assert.ok(editResult.message.includes("already completed"));
	});

	it("does not change tree if a subsequent edit fails", async () => {
		// First edit succeeds, but the second fails, so the tree should remain unchanged.
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }), {});
		view.initialize("Initial");
		const model: SharedTreeChatModel = {
			editToolName,
			async query({ edit }) {
				const result1 = await edit(`context.root = "First";`);
				assert.equal(result1.type, "success", result1.message);
				const result2 = await edit(`throw new Error("boom");`);
				assert.equal(result2.type, "executionError", result2.message);
				return result2.message;
			},
		};
		const agent = new SharedTreeSemanticAgent(model, view, {
			maximumSequentialEdits: 2,
		});
		const response = await agent.query("First");
		assert.ok(response.includes("boom"));
		assert.equal(view.root, "Initial", "Tree should not have changed");
	});

	it("passes constructors to edit code", async () => {
		const sfLocal = new SchemaFactory("Test");
		class Person extends sfLocal.object("Person", {
			name: sfLocal.required(sfLocal.string),
		}) {}
		const view = independentView(new TreeViewConfiguration({ schema: Person }), {});
		view.initialize(new Person({ name: "Alice" }));
		const model: SharedTreeChatModel = {
			editToolName,
			async query({ edit }) {
				const result = await edit(`context.root = context.create.Person({ name: "Bob" });`);
				assert.equal(result.type, "success", result.message);
				assert.equal(typeof result.message, "string");
				assert.ok(result.message.includes("Bob"));
				return "Done";
			},
		};
		const agent = new SharedTreeSemanticAgent(model, view);
		assert.equal(await agent.query("Change"), "Done");
		assert.equal((view.root as unknown as Person).name, "Bob");
	});

	it("supplies the system prompt as context", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }), {});
		view.initialize("X");
		const contexts: string[] = [];
		const model: SharedTreeChatModel = {
			editToolName,
			appendContext(text: string) {
				contexts.push(text);
			},
			async query() {
				return "Ok";
			},
		};
		const agent = new SharedTreeSemanticAgent(model, view);
		await agent.query("Q1");
		assert.ok(contexts.length > 0, "Expected at least one context message (system prompt)");
		const first = contexts[0];
		assert.notEqual(first, undefined, "Expected first context to be defined");
		assert.ok(
			(first as string).includes(editToolName),
			"System prompt should reference edit tool name",
		);
	});

	it("supplies additional context if the tree changes between queries", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }), {});
		view.initialize("Initial");
		const contexts: string[] = [];
		const model: SharedTreeChatModel = {
			appendContext(text: string) {
				contexts.push(text);
			},
			async query() {
				return "Resp";
			},
		};
		const agent = new SharedTreeSemanticAgent(model, view);
		const baseContextCount = contexts.length; // after construction
		await agent.query("First");
		const afterFirst = contexts.length;
		await agent.query("Second");
		// No tree change => no additional context about tree change.
		assert.equal(
			contexts.filter((c) => c.includes("The tree has changed since the last query")).length,
			0,
		);
		// Mutate tree externally
		view.root = "ExternallyChanged";
		await agent.query("Third");
		assert.ok(
			contexts.some((c) => c.includes("The tree has changed since the last query")),
			"Expected context noting the tree changed",
		);
		assert.ok(baseContextCount <= afterFirst);
	});

	it("can edit a subtree", async () => {
		class Child extends sf.object("Child", {
			value: sf.string,
		}) {}
		class Parent extends sf.object("Parent", {
			child: Child,
		}) {}

		const view = independentView(new TreeViewConfiguration({ schema: Parent }), {});
		view.initialize(new Parent({ child: new Child({ value: "Initial" }) }));
		let context = "";
		const model: SharedTreeChatModel = {
			editToolName: "EditTreeTool",
			appendContext(text) {
				context += `${text}\n\n`;
			},
			async query(message) {
				assert.equal(message.text, "Query");
				const result = await message.edit(
					`context.root = context.create.Child?.({ value: "Changed" });`,
				);
				assert.equal(result.type, "success", result.message);
				return "Done";
			},
		};
		const agent = new SharedTreeSemanticAgent(model, view.root.child);
		const response = await agent.query("Query");
		assert.equal(response, "Done");
		assert.equal(view.root.child.value, "Changed");
		// Context should not know about types outside of the subtree
		assert.ok(!context.includes("Parent"));
	});
});
