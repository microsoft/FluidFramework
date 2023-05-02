/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { FieldKinds, singleTextCursor } from "../../feature-libraries";
import { jsonSchemaData, jsonString, singleJsonCursor } from "../../domains";
import { rootFieldKeySymbol, fieldSchema, rootFieldKey, SchemaData } from "../../core";
import { ISharedTree, ISharedTreeView, SharedTreeFactory } from "../../shared-tree";

const factory = new SharedTreeFactory();
const runtime = new MockFluidDataStoreRuntime();
// For now, require tree to be a list of strings.
const schema: SchemaData = {
	treeSchema: jsonSchemaData.treeSchema,
	globalFieldSchema: new Map([
		[rootFieldKey, fieldSchema(FieldKinds.sequence, [jsonString.name])],
	]),
};

// TODO: Dedupe with the helpers in editing.spec.ts
function makeTree(...json: string[]): ISharedTree {
	const tree = factory.create(runtime, "TestSharedTree");
	tree.storedSchema.update(schema);
	const field = tree.editor.sequenceField({ parent: undefined, field: rootFieldKeySymbol });
	field.insert(0, json.map(singleJsonCursor));
	return tree;
}

describe("Undo", () => {
	itView("the insert of a node on the main branch from a fork", "A", (view) => {
		const fork = view.fork();

		fork.undo();
		view.merge(fork);

		expectJsonTree(view, []);
	});

	itView("the insert of a node on a fork", "A", (view) => {
		const fork = view.fork();

		insert(fork, 1, "x");

		expectJsonTree(fork, ["A", "x"]);

		fork.undo();
		view.merge(fork);

		expectJsonTree(view, ["A"]);
		expectJsonTree(fork, ["A"]);
	});

	itView("the delete of a node", ["A", "B", "C", "D"], (view) => {
		const fork = view.fork();

		remove(fork, 0, 2);

		expectJsonTree(fork, ["C", "D"]);

		view.merge(fork);

		expectJsonTree(view, ["C", "D"]);

		fork.undo();
		view.merge(fork);

		expectJsonTree(view, ["A", "B", "C", "D"]);
	});

	it("the move of a node", () => {
		const tree = makeTree("A", "B", "C", "D");

		const field = tree.editor.sequenceField({ parent: undefined, field: rootFieldKeySymbol });
		field.move(0, 2, 2);
		expectJsonTree(tree, ["C", "D", "A", "B"]);

		tree.undo();
		expectJsonTree(tree, ["A", "B", "C", "D"]);
	});

	itView("a move that has been rebased", ["A", "B", "C", "D"], (view) => {
		const fork = view.fork();

		insert(view, 1, "x");
		expectJsonTree(view, ["A", "x", "B", "C", "D"]);

		const field = fork.editor.sequenceField({ parent: undefined, field: rootFieldKeySymbol });
		field.move(1, 1, 3);
		expectJsonTree(fork, ["A", "C", "D", "B"]);

		fork.rebaseOnto(view);

		expectJsonTree(fork, ["A", "x", "C", "D", "B"]);

		// Expect that undo on deleteB still undoes the deletion of B
		fork.undo();
		expectJsonTree(fork, ["A", "x", "B", "C", "D"]);
	});

	itView("an insert from a fork on its parent", ["A", "B", "C", "D"], (view) => {
		const fork = view.fork();

		insert(fork, 1, "x");
		expectJsonTree(fork, ["A", "x", "B", "C", "D"]);

		view.merge(fork);
		expectJsonTree(view, ["A", "x", "B", "C", "D"]);

		view.undo();
		expectJsonTree(view, ["A", "B", "C", "D"]);

		fork.rebaseOnto(view);
		expectJsonTree(fork, ["A", "B", "C", "D"]);
	});

	describe.skip("tests that are being skipped due to bugs", () => {
		// TODO: See bug 4104
		itView("the move of a node on a fork", ["A", "B", "C", "D"], (view) => {
			const fork2 = view.fork();

			const field = fork2.editor.sequenceField({
				parent: undefined,
				field: rootFieldKeySymbol,
			});
			field.move(0, 2, 2);

			expectJsonTree(fork2, ["C", "D", "A", "B"]);

			view.merge(fork2);

			expectJsonTree(view, ["C", "D", "A", "B"]);

			fork2.undo();
			view.merge(fork2);

			expectJsonTree(view, ["A", "B", "C", "D"]);
		});

		// TODO: unskip when undo can handle rebasing
		itView("the insert of two separate nodes", ["A", "B", "C", "D"], (view) => {
			const addX = view.fork();
			const addY = view.fork();

			insert(addX, 1, "x");
			insert(addY, 3, "y");

			view.merge(addX);
			view.merge(addY);

			expectJsonTree(view, ["A", "x", "B", "C", "y", "D"]);

			addX.undo();
			addY.undo();
			view.merge(addX);
			view.merge(addY);

			expectJsonTree(view, ["A", "B", "C", "D"]);
		});

		// TODO: unskip when undo can handle rebasing
		itView("an insert from a parent branch on its fork", ["A", "B", "C", "D"], (view) => {
			const fork = view.fork();

			insert(view, 1, "x");
			expectJsonTree(view, ["A", "x", "B", "C", "D"]);

			fork.rebaseOnto(view);
			expectJsonTree(fork, ["A", "x", "B", "C", "D"]);

			fork.undo();
			expectJsonTree(fork, ["A", "B", "C", "D"]);

			view.merge(fork);
			expectJsonTree(view, ["A", "B", "C", "D"]);
		});

		// TODO: unskip this test once the bug that causes rebasing the undo commit to be empty is fixed.
		itView(
			"an insert that needs to be rebased over an insert on the base branch",
			["A", "B", "C", "D"],
			(view) => {
				const fork = view.fork();

				insert(view, 1, "x");
				insert(fork, 3, "y");
				view.merge(fork);

				fork.undo();
				view.merge(fork);

				expectJsonTree(view, ["A", "x", "B", "C", "D"]);
			},
		);
	});
});

// TODO: Dedupe with the helpers in editing.spec.ts

/**
 * Helper function to insert node at a given index.
 *
 * @param tree - The tree on which to perform the insert.
 * @param index - The index in the root field at which to insert.
 * @param value - The value of the inserted node.
 */
function insert(tree: ISharedTreeView, index: number, ...values: string[]): void {
	const field = tree.editor.sequenceField({ parent: undefined, field: rootFieldKeySymbol });
	const nodes = values.map((value) => singleTextCursor({ type: jsonString.name, value }));
	field.insert(index, nodes);
}

function remove(tree: ISharedTreeView, index: number, count: number): void {
	const field = tree.editor.sequenceField({ parent: undefined, field: rootFieldKeySymbol });
	field.delete(index, count);
}

function expectJsonTree(actual: ISharedTreeView | ISharedTreeView[], expected: string[]): void {
	const trees = Array.isArray(actual) ? actual : [actual];
	for (const tree of trees) {
		const roots = [...tree.context.root];
		assert.deepEqual(roots, expected);
	}
}

/**
 * Runs the given test function as two tests,
 * one where `view` is the root SharedTree view and the other where `view` is a fork.
 * This is useful for testing because both `SharedTree` and `SharedTreeFork` implement `ISharedTreeView` in different ways.
 */
function itView(
	title: string,
	initialData: string | string[],
	fn: (view: ISharedTreeView) => void,
): void {
	it(`${title} (root view)`, () => {
		const view = makeTree(...initialData);
		fn(view);
	});

	it(`${title} (forked view)`, () => {
		const view = makeTree(...initialData);
		fn(view.fork());
	});
}
