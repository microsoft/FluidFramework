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
		const code = `
	function editTree(params) {
		params.root = "Edited";
	}`;
		const model: SharedTreeChatModel = {
			editToolName,
			async query({ edit }) {
				const result = await edit(code);
				assert(result.type === "success", "Edit was not successful");
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
	function editTree(params) {
		params.root = "First Edit";
	}`;
		const secondEdit = `
	function editTreeAgain(params) {
		params.root = "Second Edit";
	}`;
		const model: SharedTreeChatModel = {
			editToolName,
			async query({ edit }) {
				editCount++;
				if (editCount === 1) {
					const result1 = await edit(firstEdit);
					assert(result1.type === "success", "First edit was not successful");
					const result2 = await edit(secondEdit);
					assert(result2.type === "success", "Second edit was not successful");
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
				const result = await edit(`function editTree(params) {
					params.root = "Edited";
				}`);
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
					const validLooking = `function verifyName(params) {
						params.root = "New";
					}`;
					const result = await edit(validLooking);
					assert.equal(result.type, "validationError");
					return result.message;
				}
				return "Second ok";
			},
		};
		const agent = new SharedTreeSemanticAgent(model, view, {
			validator: () => false,
		});
		const response = await agent.query("First");
		assert.ok(response.includes("did not pass validation"));
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
					// Does not define any function.
					const result1 = await edit("const notAFunction = 1;");
					assert.equal(result1.type, "compileError");
					assert.ok(result1.message.includes("invokable function"));
					return result1.message;
				}
				if (callCount === 2) {
					// Invalid JS syntax (missing closing brace).
					const result2 = await edit(`function stillInvalid(params){ params.root = 'Changed'`);
					assert.equal(result2.type, "compileError");
					return result2.message;
				}
				return "Recovered";
			},
		};
		const agent = new SharedTreeSemanticAgent(model, view);
		const response1 = await agent.query("First");
		assert.ok(response1.includes("invokable function"));
		const response2 = await agent.query("Second");
		assert.ok(response2.includes("not valid"));
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
					const result = await edit(`function causeBoom(params) {
						throw new Error("boom");
					}`);
					assert.equal(result.type, "runtimeError");
					return result.message;
				}
				// On second query perform successful edit to prove recovery.
				const result2 = await edit(`function repairTree(params) {
					params.root = "Recovered";
				}`);
				assert.equal(result2.type, "success");
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
					const result1 = await edit(`function editOnce(params) {
						params.root = "One";
					}`);
					assert.equal(result1.type, "success");
					const result2 = await edit(`function editTwice(params) {
						params.root = "Two";
					}`);
					assert.equal(result2.type, "success");
					const result3 = await edit(`function editThrice(params) {
						params.root = "Three";
					}`);
					assert.equal(result3.type, "tooManyEditsError");
					return result3.message;
				}
				// On second query should be able to edit again.
				const result = await edit(`function editAgain(params) {
					params.root = "Recovered";
				}`);
				assert.equal(result.type, "success");
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
		const editResult = await stolenEditCallback(
			`function lateEdit(params){ params.root = 'Edit too late'; }`,
		);
		assert.equal(editResult.type, "expiredError");
		assert.ok(editResult.message.includes("already completed"));
	});

	it("does not change tree if a subsequent edit fails", async () => {
		// First edit succeeds, but the second fails, so the tree should remain unchanged.
		const view = independentView(new TreeViewConfiguration({ schema: sf.string }), {});
		view.initialize("Initial");
		const model: SharedTreeChatModel = {
			editToolName,
			async query({ edit }) {
				const result1 = await edit(`function firstAttempt(params) {
					params.root = "First";
				}`);
				assert.equal(result1.type, "success");
				const result2 = await edit(`function secondAttempt(params) {
					throw new Error("boom");
				}`);
				assert.equal(result2.type, "runtimeError");
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
				const result = await edit(`function replacePerson(params) {
					params.root = params.create.Person({ name: "Bob" });
				}`);
				assert.equal(result.type, "success");
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
				const result = await message.edit(`function mutateChild(params) {
					params.root = params.create.Child?.({ value: "Changed" });
				}`);
				assert.equal(result.type, "success");
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

	describe("processLlmCode detection", () => {
		async function runEditWithCode(code: string): Promise<{
			result: EditResult;
			root: string;
			response: string;
		}> {
			const view = independentView(new TreeViewConfiguration({ schema: sf.string }), {});
			view.initialize("Initial");
			let captured: EditResult | undefined;
			const model: SharedTreeChatModel = {
				editToolName,
				async query({ edit }) {
					captured = await edit(code);
					return captured.message;
				},
			};
			const agent = new SharedTreeSemanticAgent(model, view);
			const response = await agent.query("Mutation");
			assert.ok(captured !== undefined, "Expected edit callback to be invoked");
			return {
				result: captured,
				root: view.root,
				response,
			};
		}

		it("supports async function declarations with arbitrary names", async () => {
			const code = `
async function renameRoot(params) {
	await Promise.resolve();
	params.root = "Async Declaration";
}`;
			const { result, root } = await runEditWithCode(code);
			assert.equal(result.type, "success");
			assert.equal(root, "Async Declaration");
		});

		it("supports function declarations with arbitrary names", async () => {
			const code = `
function renameRoot(params) {
	params.root = "Custom Declaration";
}`;
			const { result, root } = await runEditWithCode(code);
			assert.equal(result.type, "success");
			assert.equal(root, "Custom Declaration");
		});

		it("supports async function expressions assigned to constants", async () => {
			const code = `
const mutate = async function(params) {
	await Promise.resolve();
	params.root = "Async Function Expression";
};`;
			const { result, root } = await runEditWithCode(code);
			assert.equal(result.type, "success");
			assert.equal(root, "Async Function Expression");
		});

		it("supports async arrow functions", async () => {
			const code = `
const mutate = async (params) => {
	await Promise.resolve();
	params.root = "Async Arrow";
};`;
			const { result, root } = await runEditWithCode(code);
			assert.equal(result.type, "success");
			assert.equal(root, "Async Arrow");
		});

		it("supports arrow functions without async", async () => {
			const code = `
const mutate = (params) => {
	params.root = "Arrow";
};`;
			const { result, root } = await runEditWithCode(code);
			assert.equal(result.type, "success");
			assert.equal(root, "Arrow");
		});
		it("supports arrow functions without parentheses or block bodies", async () => {
			const code = `
const mutate = params => (params.root = "Implicit Arrow");
`;
			const { result, root } = await runEditWithCode(code);
			assert.equal(result.type, "success");
			assert.equal(root, "Implicit Arrow");
		});

		it("supports export function declarations", async () => {
			const code = `
export function renameRoot(params) {
	params.root = "Exported Declaration";
}
`;
			const { result, root } = await runEditWithCode(code);
			assert.equal(result.type, "success");
			assert.equal(root, "Exported Declaration");
		});

		it("supports export default function declarations", async () => {
			const code = `
export default function renameRoot(params) {
	params.root = "Exported Default";
}
`;
			const { result, root } = await runEditWithCode(code);
			assert.equal(result.type, "success");
			assert.equal(root, "Exported Default");
		});

		it("supports export const function expressions", async () => {
			const code = `
export const mutate = (params) => {
	params.root = "Exported Const";
};
`;
			const { result, root } = await runEditWithCode(code);
			assert.equal(result.type, "success");
			assert.equal(root, "Exported Const");
		});

		it("supports export default identifier statements", async () => {
			const code = `
const mutate = (params) => {
	params.root = "Exported Identifier";
};
export default mutate;
`;
			const { result, root } = await runEditWithCode(code);
			assert.equal(result.type, "success");
			assert.equal(root, "Exported Identifier");
		});

		it("supports export named specifiers", async () => {
			const code = `
const mutate = (params) => {
	params.root = "Exported Specifier";
};
export { mutate };
`;
			const { result, root } = await runEditWithCode(code);
			assert.equal(result.type, "success");
			assert.equal(root, "Exported Specifier");
		});

		it("supports reassigning declared variables", async () => {
			const code = `
let mutate;
mutate = async (params) => {
	await Promise.resolve();
	params.root = "Async Assigned";
};`;
			const { result, root } = await runEditWithCode(code);
			assert.equal(result.type, "success");
			assert.equal(root, "Async Assigned");
		});

		it("reports a compile error when no invokable function is defined", async () => {
			const { result, root, response } = await runEditWithCode("const value = 42;");
			assert.equal(result.type, "compileError");
			assert.ok(result.message.includes("invokable function"));
			assert.ok(response.includes("invokable function"));
			assert.equal(root, "Initial");
		});
	});
});
