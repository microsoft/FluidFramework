/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { UndoRedoStackManager } from "@fluidframework/undo-redo";
import { SharedTreeViewUndoRedoHandler } from "../../shared-tree";
import {
	TestTreeProviderLite,
	getTestValue,
	getTestValues,
	initializeTestTree,
	insert,
	setTestValue,
	validateTree,
} from "../utils";
import { JsonableTree } from "../../core";
import { brand } from "../../util";

/**
 * These test the SharedTreeUndoRedoHandler class, which is a wrapper around the UndoRedoStackManager class
 * that is compatible with the UndoRedoStackManager. The tests ensure that undo and redo operations are
 * properly delegated to the UndoRedoStackManager but do not test more complex undo/redo scenarios.
 */
describe("ShareTreeUndoRedoHandler", () => {
	it("can undo and redo", () => {
		const undoRedoStack = new UndoRedoStackManager();
		const handler = new SharedTreeViewUndoRedoHandler(undoRedoStack);
		const provider = new TestTreeProviderLite();

		const value = "42";
		const tree = provider.trees[0];
		handler.attachTree(tree);

		// Insert node
		setTestValue(tree, value);
		provider.processMessages();

		// Validate insertion
		assert.equal(getTestValue(tree), value);

		// Undo node insertion
		undoRedoStack.undoOperation();
		provider.processMessages();

		assert.equal(getTestValue(tree), undefined);

		// Redo node insertion
		undoRedoStack.redoOperation();
		provider.processMessages();

		assert.equal(getTestValue(tree), value);
	});

	it("can undo a redone commit", () => {
		const undoRedoStack = new UndoRedoStackManager();
		const handler = new SharedTreeViewUndoRedoHandler(undoRedoStack);
		const provider = new TestTreeProviderLite();

		const value = "42";
		const tree = provider.trees[0];
		handler.attachTree(tree);

		// Insert node
		setTestValue(tree, value);
		provider.processMessages();

		// Validate insertion
		assert.equal(getTestValue(tree), value);

		// Undo node insertion
		undoRedoStack.undoOperation();
		provider.processMessages();

		assert.equal(getTestValue(tree), undefined);

		// Redo node insertion
		undoRedoStack.redoOperation();
		provider.processMessages();

		assert.equal(getTestValue(tree), value);

		// Undo again
		undoRedoStack.undoOperation();
		provider.processMessages();

		assert.equal(getTestValue(tree), undefined);
	});

	it("can undo and redo a commit made on a fork", () => {
		const undoRedoStack = new UndoRedoStackManager();
		const handler = new SharedTreeViewUndoRedoHandler(undoRedoStack);
		const provider = new TestTreeProviderLite();

		const value = "42";
		const tree = provider.trees[0];
		handler.attachTree(tree);

		const fork = tree.fork();

		// Insert node
		setTestValue(fork, value);

		// Insert a node on the original tree to cause rebasing when merging
		const value2 = "43";
		setTestValue(tree, value2);
		undoRedoStack.closeCurrentOperation();
		tree.merge(fork);
		provider.processMessages();

		// Validate insertion
		const valuesAfterInsertion = getTestValues(tree);
		assert.equal(valuesAfterInsertion.length, 2);
		assert.equal(valuesAfterInsertion[0], value2);
		assert.equal(valuesAfterInsertion[1], value);

		// Undo node insertion
		undoRedoStack.undoOperation();
		provider.processMessages();

		const valuesAfterUndo = getTestValues(tree);
		assert.equal(valuesAfterUndo.length, 1);
		assert.equal(valuesAfterUndo[0], value2);

		// Redo node insertion
		undoRedoStack.redoOperation();
		provider.processMessages();

		const valuesAfterRedo = getTestValues(tree);
		assert.equal(valuesAfterRedo.length, 2);
		assert.equal(valuesAfterRedo[0], value2);
		assert.equal(valuesAfterRedo[1], value);
	});

	it("can undo and redo rebased edits", () => {
		const undoRedoStack = new UndoRedoStackManager();
		const handler = new SharedTreeViewUndoRedoHandler(undoRedoStack);
		const provider = new TestTreeProviderLite(2);
		const [tree1, tree2] = provider.trees;
		handler.attachTree(tree1);

		const expectedState: JsonableTree[] = stringToJsonableTree(["A", "B", "C", "D"]);
		initializeTestTree(tree1, expectedState);
		provider.processMessages();

		// Close the operation after initializing so that the initial state isn't undone
		undoRedoStack.closeCurrentOperation();

		// Validate insertion
		validateTree(tree2, expectedState);

		// Insert nodes on both trees to cause rebasing
		insert(tree1, 3, "y");
		validateTree(tree1, stringToJsonableTree(["A", "B", "C", "y", "D"]));
		insert(tree2, 1, "x");
		validateTree(tree2, stringToJsonableTree(["A", "x", "B", "C", "D"]));

		// Syncing will cause both trees to rebase their local changes
		provider.processMessages();

		const expectedStateAfterUndo: JsonableTree[] = stringToJsonableTree([
			"A",
			"x",
			"B",
			"C",
			"D",
		]);

		undoRedoStack.undoOperation();
		provider.processMessages();
		validateTree(tree1, expectedStateAfterUndo);
		validateTree(tree2, expectedStateAfterUndo);

		// Insert additional node at the beginning to require rebasing
		insert(tree2, 0, "0");
		provider.processMessages();
		validateTree(tree1, stringToJsonableTree(["0", "A", "x", "B", "C", "D"]));

		const expectedAfterRedo = stringToJsonableTree(["0", "A", "x", "B", "C", "y", "D"]);
		// Redo node insertion
		undoRedoStack.redoOperation();
		provider.processMessages();
		validateTree(tree1, expectedAfterRedo);
		validateTree(tree2, expectedAfterRedo);
	});

	it("does not add remote commits to the undo or redo stack", () => {
		const undoRedoStack = new UndoRedoStackManager();
		const handler = new SharedTreeViewUndoRedoHandler(undoRedoStack);
		const provider = new TestTreeProviderLite(2);

		const value = "42";
		const tree = provider.trees[0];
		handler.attachTree(tree);

		const undoRedoStack2 = new UndoRedoStackManager();
		const handler2 = new SharedTreeViewUndoRedoHandler(undoRedoStack2);
		const tree2 = provider.trees[1];
		handler2.attachTree(tree2);

		// Insert node on remote tree
		setTestValue(tree2, value);
		provider.processMessages();

		// Validate insertion
		assert.equal(getTestValue(tree), value);

		undoRedoStack.undoOperation();
		provider.processMessages();

		assert.equal(getTestValue(tree), value);

		// Actually undo the remote commit
		undoRedoStack2.undoOperation();
		provider.processMessages();

		assert.equal(getTestValue(tree), undefined);

		// Redo node insertion
		undoRedoStack.redoOperation();
		provider.processMessages();

		assert.equal(getTestValue(tree), undefined);
	});
});

function stringToJsonableTree(values: string[], type = "Json.String"): JsonableTree[] {
	return values.map((value) => {
		return {
			type: brand(type),
			value,
		};
	});
}
