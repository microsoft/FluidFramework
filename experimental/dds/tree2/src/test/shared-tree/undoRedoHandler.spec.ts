/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { UndoRedoStackManager } from "@fluidframework/undo-redo";
import { SharedTreeViewUndoRedoHandler } from "../../shared-tree";
import { TestTreeProviderLite, getTestValue, setTestValue } from "../utils";

describe.only("ShareTreeUndoRedoHandler", () => {
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

	it("ignores undo and redo commits", () => {
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

	it("can undo a redone commit", () => {});

	it("does not add remote commits to the undo stack", () => {});
});
