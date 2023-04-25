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
	const field = tree.editor.sequenceField(undefined, rootFieldKeySymbol);
	field.insert(0, json.map(singleJsonCursor));
	return tree;
}

describe("Undo", () => {
	it("the insert of a node on the main branch from a fork", async () => {
		const tree = makeTree("A");
		const fork = tree.fork();

		fork.undo();
		tree.merge(fork);

		expectJsonTree(tree, []);
	});

	it("the insert of a node on a fork", async () => {
		const tree = makeTree("A");
		const fork = tree.fork();

		insert(fork, 1, "x");

		expectJsonTree(fork, ["A", "x"]);

		fork.undo();
		tree.merge(fork);

		expectJsonTree(tree, ["A"]);
	});

	it("the delete of a node", async () => {
		const tree = makeTree("A", "B", "C", "D");
		const delAB = tree.fork();

		remove(delAB, 0, 2);

		expectJsonTree(delAB, ["C", "D"]);

		tree.merge(delAB);

		expectJsonTree(tree, ["C", "D"]);

		delAB.undo();
		tree.merge(delAB);

		expectJsonTree(tree, ["A", "B", "C", "D"]);
	});

	it("the set of a node", async () => {
		const tree = makeTree("A", "B", "C", "D");

		const field = tree.editor.sequenceField(undefined, rootFieldKeySymbol);
		field.move(0, 2, 2);
		expectJsonTree(tree, ["C", "D", "A", "B"]);

		tree.undo();
		expectJsonTree(tree, ["A", "B", "C", "D"]);
	});

	// TODO: See bug 4104
	it.skip("the set of a node on a fork", async () => {
		const tree = makeTree("A", "B", "C", "D");
		const fork = tree.fork();

		const field = fork.editor.sequenceField(undefined, rootFieldKeySymbol);
		field.move(0, 2, 2);

		expectJsonTree(fork, ["C", "D", "A", "B"]);

		tree.merge(fork);

		expectJsonTree(tree, ["C", "D", "A", "B"]);

		fork.undo();
		tree.merge(fork);

		expectJsonTree(tree, ["A", "B", "C", "D"]);
	});

	// TODO: unskip when undo can handle rebasing
	it.skip("the insert of two separate nodes", async () => {
		const tree = makeTree("A", "B", "C", "D");
		const addX = tree.fork();
		const addY = tree.fork();

		insert(addX, 1, "x");
		insert(addY, 3, "y");

		tree.merge(addX);
		tree.merge(addY);

		expectJsonTree(tree, ["A", "x", "B", "C", "y", "D"]);

		addX.undo();
		addY.undo();
		tree.merge(addX);
		tree.merge(addY);

		expectJsonTree(tree, ["A", "B", "C", "D"]);
	});

	// TODO: unskip when undo can handle rebasing
	it.skip("an insert from a parent branch on its fork", () => {
		const tree = makeTree("A", "B", "C", "D");
		const doUndo = tree.fork();

		insert(tree, 1, "x");
		expectJsonTree(tree, ["A", "x", "B", "C", "D"]);

		doUndo.rebaseOnto(tree);
		expectJsonTree(doUndo, ["A", "x", "B", "C", "D"]);

		doUndo.undo();
		expectJsonTree(doUndo, ["A", "B", "C", "D"]);

		tree.merge(doUndo);
		expectJsonTree(tree, ["A", "B", "C", "D"]);
	});

	it("an insert from a fork on its parent", () => {
		const tree = makeTree("A", "B", "C", "D");
		const doUndo = tree.fork();

		insert(doUndo, 1, "x");
		expectJsonTree(doUndo, ["A", "x", "B", "C", "D"]);

		tree.merge(doUndo);
		expectJsonTree(tree, ["A", "x", "B", "C", "D"]);

		tree.undo();
		expectJsonTree(tree, ["A", "B", "C", "D"]);

		doUndo.rebaseOnto(tree);
		expectJsonTree(doUndo, ["A", "B", "C", "D"]);
	});

	// TODO: unskip this test once the bug that causes rebasing the undo commit to be empty is fixed.
	it.skip("an insert that needs to be rebased over an insert on the base branch", () => {
		const tree = makeTree("A", "B", "C", "D");
		const doUndo = tree.fork();

		insert(tree, 1, "x");
		insert(doUndo, 3, "y");
		tree.merge(doUndo);

		doUndo.undo();
		tree.merge(doUndo);

		expectJsonTree(tree, ["A", "x", "B", "C", "D"]);
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
	const field = tree.editor.sequenceField(undefined, rootFieldKeySymbol);
	const nodes = values.map((value) => singleTextCursor({ type: jsonString.name, value }));
	field.insert(index, nodes);
}

function remove(tree: ISharedTreeView, index: number, count: number): void {
	const field = tree.editor.sequenceField(undefined, rootFieldKeySymbol);
	field.delete(index, count);
}

function expectJsonTree(actual: ISharedTreeView | ISharedTreeView[], expected: string[]): void {
	const trees = Array.isArray(actual) ? actual : [actual];
	for (const tree of trees) {
		const roots = [...tree.context.root];
		assert.deepEqual(roots, expected);
	}
}
