/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import { TreeAlpha } from "../../shared-tree/index.js";
import {
	SchemaFactory,
	TreeBeta,
	TreeViewConfiguration,
	type TreeView,
	type TreeViewAlpha,
	type UntypedTreeView,
} from "../../simple-tree/index.js";
import type { requireAssignableTo } from "../../util/index.js";
import { getView } from "../utils.js";

describe("UntypedTreeView", () => {
	const schemaFactory = new SchemaFactory(undefined);
	class Array extends schemaFactory.array("array", schemaFactory.string) {}

	function init(content: string[]): TreeViewAlpha<typeof Array> {
		const view = getView(
			new TreeViewConfiguration({ schema: Array, enableSchemaValidation: true }),
		);
		view.initialize(content);
		return view;
	}

	it("Test that branching from a TreeView returns a typed view (as opposed to an untyped context)", () => {
		const view = init([]);
		const forkedView = view.fork();
		type _check = requireAssignableTo<typeof forkedView, typeof view>;
	});

	it("can downcast to a view", () => {
		const view = init(["a", "b", "c"]);
		const array = view.root;
		const context = TreeAlpha.context(array);
		assert(context.isView());
		assert.equal(context.hasRootSchema(Array), true);
		assert.equal(context.hasRootSchema(schemaFactory.number), false);
		assert.deepEqual([...array], ["a", "b", "c"]);
	});

	it("runs beta transactions on a hydrated node", () => {
		const view = init(["a"]);
		const context = TreeBeta.context(view.root);
		assert(context.isView());
		type _check = requireAssignableTo<typeof context, UntypedTreeView>;
		const result = context.runTransaction(
			() => {
				view.root.insertAtEnd("b");
				return { value: view.root.length };
			},
			{ label: "append" },
		);
		assert.deepEqual(result, { success: true, value: 2 });
		assert.deepEqual([...view.root], ["a", "b"]);
	});

	it("runs beta transactions on an unhydrated node", () => {
		// eslint-disable-next-line unicorn/no-new-array -- "Array" is the new of the schema
		const node = new Array(["a"]);
		const context = TreeBeta.context(node);
		assert.equal(context.isView(), false);
		const result = context.runTransaction(
			() => {
				node.insertAtEnd("b");
				return { value: node.length };
			},
			{ label: "append" },
		);
		assert.deepEqual(result, { success: true, value: 2 });
		assert.deepEqual([...node], ["a", "b"]);
	});

	describe("forked views", () => {
		function newView(view: TreeView<typeof Array>) {
			const context = TreeAlpha.context(view.root);
			assert(context.isView());
			const forkedView = context.fork();
			assert(forkedView.hasRootSchema(Array));
			return forkedView;
		}

		it("can downcast to a view", () => {
			const view = init(["a", "b", "c"]);
			const forkedView = newView(view);
			assert(forkedView.hasRootSchema(Array));
			assert.deepEqual([...forkedView.root], ["a", "b", "c"]);
		});

		it("can be edited", () => {
			const view = init(["a", "b", "c"]);
			const forkedView = newView(view);
			forkedView.root.removeAt(0);
			forkedView.root.insertAtEnd("d");
			assert.deepEqual([...forkedView.root], ["b", "c", "d"]);
		});

		it("are isolated from their parent's changes", () => {
			const view = init(["x"]);
			const forkedView = newView(view);
			view.root.removeAt(0);
			view.root.insertAtStart("y");
			assert.deepEqual([...view.root], ["y"]);
			assert.deepEqual([...forkedView.root], ["x"]);
		});

		it("are isolated from their children's changes", () => {
			const view = init(["x"]);
			const forkedView = newView(view);
			forkedView.root.removeAt(0);
			forkedView.root.insertAtStart("y");
			assert.deepEqual([...view.root], ["x"]);
			assert.deepEqual([...forkedView.root], ["y"]);
			const nestedView = newView(forkedView);
			nestedView.root.removeAt(0);
			nestedView.root.insertAtStart("z");
			assert.deepEqual([...view.root], ["x"]);
			assert.deepEqual([...forkedView.root], ["y"]);
			assert.deepEqual([...nestedView.root], ["z"]);
		});

		it("can rebase a child over a parent", () => {
			const view = init(["x"]);
			const forkedView = newView(view);
			view.root.removeAt(0);
			view.root.insertAtStart("y");
			forkedView.rebaseOnto(view);
			assert.deepEqual([...view.root], ["y"]);
			assert.deepEqual([...forkedView.root], ["y"]);
		});

		it("can rebase a parent over a child", () => {
			const view = init(["x"]);
			const forkedView = newView(view);
			const nestedView = newView(forkedView);
			nestedView.root.removeAt(0);
			nestedView.root.insertAtStart("y");
			forkedView.rebaseOnto(nestedView);
			assert.deepEqual([...view.root], ["x"]);
			assert.deepEqual([...forkedView.root], ["y"]);
			assert.deepEqual([...nestedView.root], ["y"]);
			assert.throws(
				() => view.rebaseOnto(forkedView),
				validateAssertionError(/cannot be rebased onto another branch./),
			);
		});

		it("can merge a child into a parent", () => {
			const view = init(["x"]);
			const forkedView = newView(view);
			forkedView.root.removeAt(0);
			forkedView.root.insertAtStart("y");
			view.merge(forkedView, false);
			assert.deepEqual([...view.root], ["y"]);
			assert.deepEqual([...forkedView.root], ["y"]);
		});

		it("can merge a parent into a child", () => {
			const view = init(["x"]);
			const forkedView = newView(view);
			const nestedView = newView(forkedView);
			forkedView.root.removeAt(0);
			forkedView.root.insertAtStart("y");
			nestedView.merge(forkedView, false);
			assert.deepEqual([...view.root], ["x"]);
			assert.deepEqual([...forkedView.root], ["y"]);
			assert.deepEqual([...nestedView.root], ["y"]);
			view.root.removeAt(0);
			view.root.insertAtStart("z");
			forkedView.merge(view); // No need to pass `false` here, because it's the main view
			assert.deepEqual([...forkedView.root], ["z", "y"]);
		});

		it("can be manually disposed", () => {
			const view = init(["x"]);
			const forkedView = newView(view);
			forkedView.dispose();
			assert.throws(() => {
				forkedView.root.removeAt(0);
			}, /disposed/);
		});

		it("are properly disposed after merging", () => {
			const view = init(["x"]);
			const forkedView = newView(view);
			forkedView.merge(view, true); // Should not dispose, because it's the main view
			forkedView.merge(view); // Should not dispose, because it's the main view
			view.merge(forkedView, false); // Should not dispose, because we passed 'false'
			forkedView.root.removeAt(0);
			view.merge(forkedView); // Should dispose, because default is 'true'
			assert.throws(() => {
				forkedView.root.insertAtStart("y");
			}, /disposed/);
		});
	});
});
