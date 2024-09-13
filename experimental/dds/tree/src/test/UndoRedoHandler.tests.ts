/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UndoRedoStackManager } from '@fluidframework/undo-redo/internal';

import { EditId } from '../Identifiers.js';
import { SharedTree } from '../SharedTree.js';
import { SharedTreeUndoRedoHandler } from '../UndoRedoHandler.js';

import { runSharedTreeUndoRedoTestSuite } from './utilities/UndoRedoTests.js';

describe('SharedTreeUndoRedoHandler', () => {
	let undoRedoStack: UndoRedoStackManager;
	let handler: SharedTreeUndoRedoHandler;

	const undoRedoOptions = {
		beforeEach: (trees: SharedTree[]) => {
			undoRedoStack = new UndoRedoStackManager();
			handler = new SharedTreeUndoRedoHandler(undoRedoStack);

			// Attach each tree to the handler
			trees.forEach((tree) => handler.attachTree(tree));
		},
		undo: (tree: SharedTree, editId: EditId) => {
			undoRedoStack.undoOperation();

			// Returns a dummy edit id in order to satisfy the interface.
			return 'aa26ef18-76a9-4238-9c29-9b796d21ef5a' as EditId;
		},
		redo: (tree: SharedTree, editId: EditId) => {
			undoRedoStack.redoOperation();

			// Returns a dummy edit id in order to satisfy the interface.
			return 'aa26ef18-76a9-4238-9c29-9b796d21ef5a' as EditId;
		},
		afterEdit: () => {
			undoRedoStack.closeCurrentOperation();
		},
		// The SharedTreeUndoRedoHandler does not support out of order revert.
		testOutOfOrderRevert: false,
	};

	runSharedTreeUndoRedoTestSuite({
		localMode: true,
		title: 'in local mode',
		...undoRedoOptions,
	});
	runSharedTreeUndoRedoTestSuite({
		localMode: false,
		title: 'in connected mode',
		...undoRedoOptions,
	});
});
