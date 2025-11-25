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

import { createContext, SharedTreeSemanticAgent } from "../agent.js";
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
					assert.equal(result1.type, "editingError", result1.message);
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
					assert.equal(result.type, "editingError", result.message);
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

	it("does not roll back if a failed edit is followed by a successful edit in the same query", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }), {});
		view.initialize("Content");
		const model: SharedTreeChatModel = {
			editToolName,
			async query({ edit }) {
				const result1 = await edit(`throw new Error("boom");`);
				assert.equal(result1.type, "editingError", result1.message);
				const result2 = await edit(`context.root = "Recovered";`);
				assert.equal(result2.type, "success", result2.message);
				return result2.message;
			},
		};
		const agent = new SharedTreeSemanticAgent(model, view);
		const response = await agent.query("First");
		assert.match(response, /the new state of the tree is/i);
		assert.equal(view.root, "Recovered");
	});

	it("rolls back if a successful edit is followed by a failed edit in the same query", async () => {
		// First edit succeeds, but the second fails, so the tree should remain unchanged.
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }), {});
		view.initialize("Initial");
		const model: SharedTreeChatModel = {
			editToolName,
			async query({ edit }) {
				const result1 = await edit(`context.root = "First";`);
				assert.equal(result1.type, "success", result1.message);
				const result2 = await edit(`throw new Error("boom");`);
				assert.equal(result2.type, "editingError", result2.message);
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

	it("can insert content multiple times", async () => {
		class Color extends sf.object("Color", {
			r: sf.number,
			g: sf.number,
			b: sf.number,
		}) {}
		class Gradient extends sf.object("Gradient", {
			startColor: Color,
			endColor: Color,
		}) {}
		const view = independentView(new TreeViewConfiguration({ schema: Gradient }), {});
		view.initialize({ startColor: { r: 0, g: 0, b: 0 }, endColor: { r: 0, g: 0, b: 0 } });
		const code = `const white = context.create.Color({ r: 255, g: 255, b: 255 }); 
context.root = context.create.Gradient({ startColor: white, endColor: white });`;
		const model: SharedTreeChatModel = {
			editToolName,
			async query({ edit }) {
				const result = await edit(code);
				assert(result.type === "success", result.message);
				return result.message;
			},
		};
		const agent = new SharedTreeSemanticAgent(model, view);
		await agent.query("Query");
		assert.equal(view.root.startColor.r, 255);
	});

	describe("context helpers", () => {
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
					return "Done";
				},
			};
			const agent = new SharedTreeSemanticAgent(model, view);
			assert.equal(await agent.query("Change"), "Done");
			assert.equal(view.root.name, "Bob");
		});

		it("provides working type guards via context.is", async () => {
			const sfLocal = new SchemaFactory("TestIs");
			class Person extends sfLocal.object("Person", {
				name: sfLocal.required(sfLocal.string),
				age: sfLocal.required(sfLocal.number),
			}) {}
			const view = independentView(new TreeViewConfiguration({ schema: Person }), {});
			view.initialize(new Person({ name: "Alice", age: 25 }));
			const model: SharedTreeChatModel = {
				editToolName,
				async query({ edit }) {
					const result = await edit(
						`if (context.is.Person(context.root)) { context.root.age = 26; } else { throw new Error('Type guard failed'); }`,
					);
					assert.equal(result.type, "success", result.message);
					return "OK";
				},
			};
			const agent = new SharedTreeSemanticAgent(model, view);
			assert.equal(await agent.query("Update Age"), "OK");
			assert.equal(view.root.age, 26);
		});

		it("exposes parent helper returning the owning object", async () => {
			const sfLocal = new SchemaFactory("TestParent");
			class Child extends sfLocal.object("Child", {
				value: sfLocal.required(sfLocal.string),
			}) {}
			class Parent extends sfLocal.object("Parent", { child: Child }) {}
			const view = independentView(new TreeViewConfiguration({ schema: Parent }), {});
			view.initialize(new Parent({ child: new Child({ value: "Initial" }) }));
			const model: SharedTreeChatModel = {
				editToolName,
				async query({ edit }) {
					const result = await edit(
						`const p = context.parent(context.root.child); if (!p) { throw new Error('No parent'); } if (!context.is.Parent(p)) { throw new Error('Wrong parent type'); } p.child.value = 'ViaParent';`,
					);
					assert.equal(result.type, "success", result.message);
					return "Done";
				},
			};
			const agent = new SharedTreeSemanticAgent(model, view);
			assert.equal(await agent.query("Parent Edit"), "Done");
			assert.equal(view.root.child.value, "ViaParent");
		});

		it("exposes key helper returning property name for object child", async () => {
			const sfLocal = new SchemaFactory("TestKey");
			class Child extends sfLocal.object("Child", {
				value: sfLocal.required(sfLocal.string),
			}) {}
			class Parent extends sfLocal.object("Parent", { child: Child }) {}
			const view = independentView(new TreeViewConfiguration({ schema: Parent }), {});
			view.initialize(new Parent({ child: new Child({ value: "Initial" }) }));
			const model: SharedTreeChatModel = {
				editToolName,
				async query({ edit }) {
					const result = await edit(
						`const k = context.key(context.root.child); if (k !== 'child') { throw new Error('Unexpected key: ' + k); } context.root.child.value = 'KeyWorked';`,
					);
					assert.equal(result.type, "success", result.message);
					return "Done";
				},
			};
			const agent = new SharedTreeSemanticAgent(model, view);
			assert.equal(await agent.query("Key Edit"), "Done");
			assert.equal(view.root.child.value, "KeyWorked");
		});

		it("provides working isArray helper", async () => {
			const sfLocal = new SchemaFactory("TestIsArray");
			const NumberArray = sfLocal.array(sfLocal.number);
			const view = independentView(new TreeViewConfiguration({ schema: NumberArray }), {});
			view.initialize([1, 2, 3]);
			const model: SharedTreeChatModel = {
				editToolName,
				async query({ edit }) {
					const result = await edit(
						`if (!context.isArray([]) ||!context.isArray(context.root)) { throw new Error('Expected array root'); } context.root.insertAt(0, 99);`,
					);
					assert.equal(result.type, "success", result.message);
					return "ArrayOK";
				},
			};
			const agent = new SharedTreeSemanticAgent(model, view);
			assert.equal(await agent.query("Array Edit"), "ArrayOK");
			assert.equal(view.root[0], 99);
		});

		it("provides working isMap helper", async () => {
			const sfLocal = new SchemaFactory("TestIsMap");
			class NumberMap extends sfLocal.map("NumberMap", sfLocal.number) {}
			const view = independentView(new TreeViewConfiguration({ schema: NumberMap }), {});
			view.initialize(new NumberMap(new Map([["x", 1]])));
			const model: SharedTreeChatModel = {
				editToolName,
				async query({ edit }) {
					const result = await edit(
						`if (!context.isMap(new Map()) || !context.isMap(context.root)) { throw new Error('Expected map root'); } context.root.set('y', 2);`,
					);
					assert.equal(result.type, "success", result.message);
					return "MapOK";
				},
			};
			const agent = new SharedTreeSemanticAgent(model, view);
			assert.equal(await agent.query("Map Edit"), "MapOK");
			assert.equal(view.root.get("y"), 2);
		});
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

	it("runs custom editors", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }), {});
		view.initialize("Content");
		const model: SharedTreeChatModel = {
			editToolName,
			async query({ edit }) {
				const result = await edit("Code");
				assert(result.type === "success", result.message);
				return "Done";
			},
		};
		const agent = new SharedTreeSemanticAgent(model, view, {
			editor: async (tree, js) => {
				const context = createContext(tree);
				assert.equal(context.root, "Content");
				assert.equal(js, "Code");
				context.root = "Edited";
			},
		});
		const response = await agent.query("Query");
		assert.equal(response, "Done");
		assert.equal(view.root, "Edited");
	});

	it("catches errors from custom editors", async () => {
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }), {});
		view.initialize("Content");
		const model: SharedTreeChatModel = {
			editToolName,
			async query({ edit }) {
				const result = await edit("Code");
				assert(result.type === "editingError", "Expected editingError from editor");
				return "Done";
			},
		};
		const agent = new SharedTreeSemanticAgent(model, view, {
			editor: async () => {
				throw new Error("Boom");
			},
		});
		const response = await agent.query("Query");
		assert.equal(response, "Done");
	});

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
		const view = independentView(new TreeViewConfiguration({ schema: Parent }), {});
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
