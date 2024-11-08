/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	SchemaFactory,
	TreeViewConfiguration,
	type TreeView,
	type TreeViewAlpha,
} from "../../simple-tree/index.js";

import { getView } from "../utils.js";
import { TreeAlpha } from "../../shared-tree/index.js";
import type { requireAssignableTo } from "../../util/index.js";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

describe("TreeBranch", () => {
	const schemaFactory = new SchemaFactory(undefined);
	class Array extends schemaFactory.array("array", schemaFactory.string) {}

	function init(content: string[]): TreeViewAlpha<typeof Array> {
		const view = getView(
			new TreeViewConfiguration({ schema: Array, enableSchemaValidation: true }),
		);
		view.initialize(content);
		return view;
	}

	{
		// Test that branching from a TreeView returns a typed view (as opposed to an untyped context).
		const view = init([]);
		const branch = view.fork();
		type _check = requireAssignableTo<typeof branch, typeof view>;
	}

	it("can downcast to a view", () => {
		const view = init(["a", "b", "c"]);
		const array = view.root;
		const context = TreeAlpha.branch(array);
		assert(context !== undefined);
		assert.equal(context.hasRootSchema(Array), true);
		assert.equal(context.hasRootSchema(schemaFactory.number), false);
		assert.deepEqual([...array], ["a", "b", "c"]);
	});

	describe("branches", () => {
		function newBranch(view: TreeView<typeof Array>) {
			const context = TreeAlpha.branch(view.root);
			assert(context !== undefined);
			const branch = context.fork();
			assert(branch.hasRootSchema(Array));
			return branch;
		}

		it("can downcast to a view", () => {
			const view = init(["a", "b", "c"]);
			const branch = newBranch(view);
			assert(branch.hasRootSchema(Array));
			assert.deepEqual([...branch.root], ["a", "b", "c"]);
		});

		it("can be edited", () => {
			const view = init(["a", "b", "c"]);
			const branch = newBranch(view);
			branch.root.removeAt(0);
			branch.root.insertAtEnd("d");
			assert.deepEqual([...branch.root], ["b", "c", "d"]);
		});

		it("are isolated from their parent's changes", () => {
			const view = init(["x"]);
			const branch = newBranch(view);
			view.root.removeAt(0);
			view.root.insertAtStart("y");
			assert.deepEqual([...view.root], ["y"]);
			assert.deepEqual([...branch.root], ["x"]);
		});

		it("are isolated from their children's changes", () => {
			const view = init(["x"]);
			const branch = newBranch(view);
			branch.root.removeAt(0);
			branch.root.insertAtStart("y");
			assert.deepEqual([...view.root], ["x"]);
			assert.deepEqual([...branch.root], ["y"]);
			const branchBranch = newBranch(branch);
			branchBranch.root.removeAt(0);
			branchBranch.root.insertAtStart("z");
			assert.deepEqual([...view.root], ["x"]);
			assert.deepEqual([...branch.root], ["y"]);
			assert.deepEqual([...branchBranch.root], ["z"]);
		});

		it("can rebase a child over a parent", () => {
			const view = init(["x"]);
			const branch = newBranch(view);
			view.root.removeAt(0);
			view.root.insertAtStart("y");
			branch.rebaseOnto(view);
			assert.deepEqual([...view.root], ["y"]);
			assert.deepEqual([...branch.root], ["y"]);
		});

		it("can rebase a parent over a child", () => {
			const view = init(["x"]);
			const branch = newBranch(view);
			const branchBranch = newBranch(branch);
			branchBranch.root.removeAt(0);
			branchBranch.root.insertAtStart("y");
			branch.rebaseOnto(branchBranch);
			assert.deepEqual([...view.root], ["x"]);
			assert.deepEqual([...branch.root], ["y"]);
			assert.deepEqual([...branchBranch.root], ["y"]);
			assert.throws(
				() => view.rebaseOnto(branch),
				(e: Error) =>
					validateAssertionError(e, /The main branch cannot be rebased onto another branch./),
			);
		});

		it("can merge a child into a parent", () => {
			const view = init(["x"]);
			const branch = newBranch(view);
			branch.root.removeAt(0);
			branch.root.insertAtStart("y");
			view.merge(branch, false);
			assert.deepEqual([...view.root], ["y"]);
			assert.deepEqual([...branch.root], ["y"]);
		});

		it("can merge a parent into a child", () => {
			const view = init(["x"]);
			const branch = newBranch(view);
			const branchBranch = newBranch(branch);
			branch.root.removeAt(0);
			branch.root.insertAtStart("y");
			branchBranch.merge(branch, false);
			assert.deepEqual([...view.root], ["x"]);
			assert.deepEqual([...branch.root], ["y"]);
			assert.deepEqual([...branchBranch.root], ["y"]);
			view.root.removeAt(0);
			view.root.insertAtStart("z");
			branch.merge(view); // No need to pass `false` here, because it's the main branch
			assert.deepEqual([...branch.root], ["z", "y"]);
		});

		it("can be manually disposed", () => {
			const view = init(["x"]);
			const branch = newBranch(view);
			branch.dispose();
			assert.throws(() => {
				branch.root.removeAt(0);
			}, /disposed/);
		});

		it("are properly disposed after merging", () => {
			const view = init(["x"]);
			const branch = newBranch(view);
			branch.merge(view, true); // Should not dispose, because it's the main branch
			branch.merge(view); // Should not dispose, because it's the main branch
			view.merge(branch, false); // Should not dispose, because we passed 'false'
			branch.root.removeAt(0);
			view.merge(branch); // Should dispose, because default is 'true'
			assert.throws(() => {
				branch.root.insertAtStart("y");
			}, /disposed/);
		});
	});
});
