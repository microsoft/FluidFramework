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
		fork.merge();

		expectJsonTree(tree, []);
	});

	it("the insert of a node on a fork", async () => {
		const tree = makeTree("A");
		const fork = tree.fork();

		insert(fork, 1, "x");

		expectJsonTree(fork, ["A", "x"]);

		fork.undo();
		fork.merge();

		expectJsonTree(tree, ["A"]);
	});

	it("the delete of a node", async () => {
		const tree = makeTree("A", "B", "C", "D");
		const delAB = tree.fork();

		remove(delAB, 0, 2);

		expectJsonTree(delAB, ["C", "D"]);

		delAB.merge();

		expectJsonTree(tree, ["C", "D"]);

		delAB.undo();
		delAB.merge();

		expectJsonTree(tree, ["A", "B", "C", "D"]);
	});

	// TODO: enable once rebasing works for merge
	it.skip("the insert of two separate nodes", async () => {
		const tree = makeTree("A", "B", "C", "D");
		const addX = tree.fork();
		const addY = tree.fork();

		insert(addX, 1, "x");
		insert(addY, 3, "y");

		addX.merge();
		addY.merge();

		expectJsonTree(tree, ["A", "x", "B", "C", "y", "D"]);

		addX.undo();
		addY.undo();
		addX.merge();
		addY.merge();

		expectJsonTree(tree, ["A", "B", "C", "D"]);
	});

	// TODO: enable once rebasing works for merge
	it.skip("can be rebased", () => {
		const tree = makeTree("A", "B", "C", "D");
		const addX = tree.fork();
		const addY = tree.fork();

		insert(addX, 1, "x");
		insert(addY, 3, "y");

		addX.merge();
		addY.merge();

		expectJsonTree(tree, ["A", "x", "B", "C", "y", "D"]);

		remove(addX, 3, 1);

		addY.undo();
		addX.merge();
		addY.merge();

		expectJsonTree(tree, ["A", "x", "B", "C", "D"]);
	});
});

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
