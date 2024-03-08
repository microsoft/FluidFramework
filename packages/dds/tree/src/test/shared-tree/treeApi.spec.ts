/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "node:assert";
import { Tree } from "../../shared-tree/index.js";
import { SchemaFactory, TreeConfiguration } from "../../simple-tree/index.js";
import { getView } from "../utils.js";

const schema = new SchemaFactory("com.example");
class TestObject extends schema.object("TestObject", { content: schema.number }) {}

describe("treeApi", () => {
	describe("runTransaction invoked via a tree view", () => {
		it("runs transactions", () => {
			const view = getView(new TreeConfiguration(TestObject, () => ({ content: 42 })));
			Tree.runTransaction(view, (root) => {
				root.content = 43;
			});
			assert.equal(view.root.content, 43);
		});

		it("can be rolled back", () => {
			const view = getView(new TreeConfiguration(TestObject, () => ({ content: 42 })));
			Tree.runTransaction(view, (root) => {
				root.content = 43;
				return "rollback";
			});
			assert.equal(view.root.content, 42);
		});

		it("rolls back transactions on error", () => {
			const view = getView(new TreeConfiguration(TestObject, () => ({ content: 42 })));
			try {
				Tree.runTransaction(view, (root) => {
					root.content = 43;
					throw Error("Oh no");
				});
			} catch (e) {
				assert(e instanceof Error);
				assert.equal(e.message, "Oh no");
			}
			assert.equal(view.root.content, 42);
		});

		// TODO: Either enable when afterBatch is implemented, or delete if no longer relevant
		it.skip("emits change events", () => {
			const view = getView(new TreeConfiguration(TestObject, () => ({ content: 42 })));
			let event = false;
			view.events.on("afterBatch", () => (event = true));
			view.root.content = 44;
			Tree.runTransaction(view, (root) => {
				root.content = 43;
			});
			assert.equal(event, true);
		});
	});

	describe("runTransaction invoked via a node", () => {
		it("runs transactions", () => {
			const { root } = getView(new TreeConfiguration(TestObject, () => ({ content: 42 })));
			Tree.runTransaction(root, (r) => {
				r.content = 43;
			});
			assert.equal(root.content, 43);
		});

		it("can be rolled back", () => {
			const { root } = getView(new TreeConfiguration(TestObject, () => ({ content: 42 })));
			Tree.runTransaction(root, (r) => {
				r.content = 43;
				return "rollback";
			});
			assert.equal(root.content, 42);
		});

		it("rolls back transactions on error", () => {
			const { root } = getView(new TreeConfiguration(TestObject, () => ({ content: 42 })));
			try {
				Tree.runTransaction(root, (r) => {
					r.content = 43;
					throw Error("Oh no");
				});
			} catch (e) {
				assert(e instanceof Error);
				assert.equal(e.message, "Oh no");
			}
			assert.equal(root.content, 42);
		});

		it("emits change events", () => {
			const { root } = getView(new TreeConfiguration(TestObject, () => ({ content: 42 })));
			let event = false;
			Tree.on(root, "afterChange", () => (event = true));
			Tree.runTransaction(root, (r) => {
				r.content = 43;
			});
			assert.equal(event, true);
		});

		// TODO: When SchematizingSimpleTreeView supports forking, add test coverage to ensure that transactions work properly on forks
	});
});
