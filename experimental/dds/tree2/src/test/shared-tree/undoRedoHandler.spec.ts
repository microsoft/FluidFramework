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
	initializeTestTree,
	insert,
	setTestValue,
	stringToJsonableTree,
	validateTree,
} from "../utils";
import { JsonableTree } from "../../core";

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

	it("can undo and redo rebased edits", () => {
		const undoRedoStack = new UndoRedoStackManager();
		const handler = new SharedTreeViewUndoRedoHandler(undoRedoStack);
		const provider = new TestTreeProviderLite(2);
		const [tree1, tree2] = provider.trees;
		handler.attachTree(tree1);

		const expectedState: JsonableTree[] = stringToJsonableTree(["A", "B", "C", "D"]);
		initializeTestTree(tree1, expectedState);
		provider.processMessages();

		// Validate insertion
		validateTree(tree2, expectedState);

		// Insert nodes on both trees
		insert(tree1, 1, "x");
		validateTree(tree1, stringToJsonableTree(["A", "x", "B", "C", "D"]));

		insert(tree2, 3, "y");
		validateTree(tree2, stringToJsonableTree(["A", "B", "C", "y", "D"]));

		// Syncing will cause both trees to rebase their local changes
		provider.processMessages();

		const expectedStateAfterUndo: JsonableTree[] = stringToJsonableTree([
			"A",
			"B",
			"C",
			"y",
			"D",
		]);

		undoRedoStack.undoOperation();
		provider.processMessages();
		validateTree(tree1, expectedStateAfterUndo);
		validateTree(tree2, expectedStateAfterUndo);

		// Insert additional node at the beginning to require rebasing
		insert(tree1, 0, "0");
		validateTree(tree1, stringToJsonableTree(["0", "A", "B", "C", "y", "D"]));

		const expectedAfterRedo = stringToJsonableTree(["0", "A", "x", "B", "C", "y", "D"]);
		// Redo node insertion on both trees
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
