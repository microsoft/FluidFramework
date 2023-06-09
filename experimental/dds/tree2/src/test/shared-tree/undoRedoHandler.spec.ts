/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { UndoRedoStackManager } from "@fluidframework/undo-redo";
import { SharedTreeViewUndoRedoHandler } from "../../shared-tree";
import { TestTreeProviderLite, getTestValue, setTestValue } from "../utils";

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
