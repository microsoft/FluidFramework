/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { MockContainerRuntimeFactory } from '@fluidframework/test-runtime-utils';
import { expect } from 'chai';
import { v4 as uuidv4 } from 'uuid';
import { noop } from '../../Common';
import { Definition, EditId, NodeId, TraitLabel } from '../../Identifiers';
import { Change, ChangeNode, StablePlace } from '../../PersistedTypes';
import { SharedTree } from '../../SharedTree';
import { makeEmptyNode, setUpTestSharedTree } from './TestUtilities';

/** Options used to generate a SharedTree undo/redo test suite. */
interface SharedTreeUndoRedoOptions {
	/** Determines if the tests should be run in local state or connected state with a remote SharedTree */
	localMode: boolean;
	/** Title used for the test suite describe block. */
	title: string;
	/** Function for undoing an edit on a given tree. */
	undo: (tree: SharedTree, editId: EditId) => EditId;
	/** Function for redoing an edit on a given tree. */
	redo: (tree: SharedTree, editId: EditId) => EditId;
	/** Optional additional setup to run in a beforeEach block that takes the SharedTrees used in the tests. */
	beforeEach?: (trees: SharedTree[]) => void;
	/**
	 * Function to run after edits. Used for testing the SharedTreeUndoRedoHandler in order to close stack
	 * operations between edits.
	 */
	afterEdit?: () => void;
	/** If true, runs tests for out-of-order undo/redo. True by default. */
	testOutOfOrderRevert?: boolean;
}

/**
 * Runs undo/redo tests for SharedTree
 */
export function runSharedTreeUndoRedoTestSuite(options: SharedTreeUndoRedoOptions): Mocha.Suite {
	const { localMode, title, undo, redo, beforeEach: additionalSetup } = options;
	const afterEdit = options.afterEdit || noop;
	const testOutOfOrderRevert = options.testOutOfOrderRevert === undefined ? true : options.testOutOfOrderRevert;

	const definition = 'node' as Definition;

	const left: ChangeNode = makeEmptyNode();
	const right: ChangeNode = makeEmptyNode();
	const leftTraitLabel = 'left' as TraitLabel;
	const rightTraitLabel = 'right' as TraitLabel;

	const initialTree: ChangeNode = {
		definition,
		identifier: uuidv4() as NodeId,
		traits: { [leftTraitLabel]: [left], [rightTraitLabel]: [right] },
	};

	const treeOptions = {
		initialTree,
		localMode,
	};

	const secondTreeOptions = {
		localMode,
		id: 'secondTestTree',
	};

	return describe(title, () => {
		let tree: SharedTree;
		let undoTree: SharedTree;
		let containerRuntimeFactory: MockContainerRuntimeFactory;

		beforeEach(() => {
			const setupResult = setUpTestSharedTree(treeOptions);
			tree = setupResult.tree;
			containerRuntimeFactory = setupResult.containerRuntimeFactory;
			const secondTree = localMode
				? undefined
				: setUpTestSharedTree({ containerRuntimeFactory, ...secondTreeOptions }).tree;
			undoTree = secondTree || tree;

			if (additionalSetup !== undefined) {
				if (secondTree !== undefined) {
					additionalSetup([tree, undoTree]);
				} else {
					additionalSetup([tree]);
				}
			}
		});

		it('works for Insert', () => {
			const newNode = makeEmptyNode();

			const insertId = tree.editor.insert(newNode, StablePlace.after(left));
			afterEdit();
			expect(tree.edits.length).to.equal(2);

			if (!localMode) {
				containerRuntimeFactory.processAllMessages();
			}

			// Undo testing
			const undoId: EditId = undo(undoTree, insertId);

			if (!localMode) {
				containerRuntimeFactory.processAllMessages();
			}

			expect(tree.edits.length).to.equal(3);

			// Check the inserted node was deleted
			const leftTraitAfterUndo = tree.currentView.getTrait({
				parent: initialTree.identifier,
				label: leftTraitLabel,
			});
			expect(leftTraitAfterUndo.length).to.equal(1);

			// Redo testing
			redo(undoTree, undoId);

			if (!localMode) {
				containerRuntimeFactory.processAllMessages();
			}

			expect(tree.edits.length).to.equal(4);

			// Check the inserted node was reinserted
			const leftTraitAfterRedo = tree.currentView.getTrait({
				parent: initialTree.identifier,
				label: leftTraitLabel,
			});
			expect(leftTraitAfterRedo.length).to.equal(2);
		});

		it('works for Detach', () => {
			const newNode = makeEmptyNode();

			tree.editor.insert(newNode, StablePlace.after(left));
			afterEdit();
			const deleteId = tree.editor.delete(newNode);
			afterEdit();
			expect(tree.edits.length).to.equal(3);

			if (!localMode) {
				containerRuntimeFactory.processAllMessages();
			}

			// Undo testing
			const undoId: EditId = undo(undoTree, deleteId);

			if (!localMode) {
				containerRuntimeFactory.processAllMessages();
			}

			expect(tree.edits.length).to.equal(4);

			const leftTraitAfterUndo = tree.currentView.getTrait({
				parent: initialTree.identifier,
				label: leftTraitLabel,
			});
			expect(leftTraitAfterUndo.length).to.equal(2);

			// Redo testing
			redo(undoTree, undoId);

			if (!localMode) {
				containerRuntimeFactory.processAllMessages();
			}

			expect(tree.edits.length).to.equal(5);

			const leftTraitAfterRedo = tree.currentView.getTrait({
				parent: initialTree.identifier,
				label: leftTraitLabel,
			});
			expect(leftTraitAfterRedo.length).to.equal(1);
		});

		it('works for SetValue', () => {
			const newNode = makeEmptyNode();

			tree.editor.insert(newNode, StablePlace.after(left));
			afterEdit();
			const testPayload = 5;
			const setValueId = tree.applyEdit(Change.setPayload(newNode.identifier, testPayload));
			afterEdit();
			expect(tree.edits.length).to.equal(3);

			if (!localMode) {
				containerRuntimeFactory.processAllMessages();
			}

			// Undo testing
			const undoId: EditId = undo(undoTree, setValueId);

			if (!localMode) {
				containerRuntimeFactory.processAllMessages();
			}

			expect(tree.edits.length).to.equal(4);

			// Check the node whose value was set now has an empty payload
			const leftTraitAfterUndo = tree.currentView.getTrait({
				parent: initialTree.identifier,
				label: leftTraitLabel,
			});
			const nodeAfterUndo = tree.currentView.getSnapshotNode(leftTraitAfterUndo[1]);
			expect(nodeAfterUndo.payload).to.be.undefined;

			// Redo testing
			redo(undoTree, undoId);

			if (!localMode) {
				containerRuntimeFactory.processAllMessages();
			}

			expect(tree.edits.length).to.equal(5);

			// Check the inserted node was reinserted
			const leftTraitAfterRedo = tree.currentView.getTrait({
				parent: initialTree.identifier,
				label: leftTraitLabel,
			});
			const nodeAfterRedo = tree.currentView.getSnapshotNode(leftTraitAfterRedo[1]);
			expect(nodeAfterRedo.payload).equal(testPayload);
		});

		if (testOutOfOrderRevert === true) {
			it('works for out-of-order Insert', () => {
				const firstNode = makeEmptyNode();
				const secondNode = makeEmptyNode();

				const firstInsertId = tree.editor.insert(firstNode, StablePlace.after(left));
				afterEdit();
				tree.editor.insert(secondNode, StablePlace.after(left));
				afterEdit();
				expect(tree.edits.length).to.equal(3);

				if (!localMode) {
					containerRuntimeFactory.processAllMessages();
				}

				// Undo testing
				const undoId: EditId = undo(undoTree, firstInsertId);

				if (!localMode) {
					containerRuntimeFactory.processAllMessages();
				}

				const editsAfterUndo = tree.edits;
				expect(editsAfterUndo.length).to.equal(4);

				const leftTraitAfterUndo = tree.currentView.getTrait({
					parent: initialTree.identifier,
					label: leftTraitLabel,
				});
				expect(leftTraitAfterUndo.length).to.equal(2);

				// Check that the node under the left trait is the second node
				const nodeAfterUndo = tree.currentView.getSnapshotNode(leftTraitAfterUndo[1]);
				expect(nodeAfterUndo.identifier).to.equal(secondNode.identifier);

				// Redo testing
				redo(undoTree, undoId);

				if (!localMode) {
					containerRuntimeFactory.processAllMessages();
				}

				expect(tree.edits.length).to.equal(5);

				const leftTraitAfterRedo = tree.currentView.getTrait({
					parent: initialTree.identifier,
					label: leftTraitLabel,
				});
				expect(leftTraitAfterRedo.length).to.equal(3);
			});

			it('works for out-of-order Detach', () => {
				const firstNode = makeEmptyNode();
				const secondNode = makeEmptyNode();

				tree.editor.insert(firstNode, StablePlace.after(left));
				afterEdit();
				const deleteId = tree.editor.delete(firstNode);
				afterEdit();
				tree.editor.insert(secondNode, StablePlace.after(left));
				afterEdit();
				expect(tree.edits.length).to.equal(4);

				if (!localMode) {
					containerRuntimeFactory.processAllMessages();
				}

				// Undo testing
				const undoId: EditId = undo(undoTree, deleteId);

				if (!localMode) {
					containerRuntimeFactory.processAllMessages();
				}

				expect(tree.edits.length).to.equal(5);

				const leftTraitAfterUndo = tree.currentView.getTrait({
					parent: initialTree.identifier,
					label: leftTraitLabel,
				});
				expect(leftTraitAfterUndo.length).to.equal(3);

				// Check the first node is the second one under the left trait
				const nodeAfterUndo = tree.currentView.getSnapshotNode(leftTraitAfterUndo[1]);
				expect(nodeAfterUndo.identifier).to.equal(firstNode.identifier);

				// Redo testing
				redo(undoTree, undoId);

				if (!localMode) {
					containerRuntimeFactory.processAllMessages();
				}

				expect(tree.edits.length).to.equal(6);

				const leftTraitAfterRedo = tree.currentView.getTrait({
					parent: initialTree.identifier,
					label: leftTraitLabel,
				});
				expect(leftTraitAfterRedo.length).to.equal(2);
			});

			it('works for out-of-order SetValue', () => {
				const newNode = makeEmptyNode();

				tree.editor.insert(newNode, StablePlace.after(left));
				afterEdit();
				const testPayload = 10;
				const setValueId = tree.applyEdit(Change.setPayload(newNode.identifier, testPayload));
				afterEdit();
				tree.editor.insert(newNode, StablePlace.after(left));
				afterEdit();
				expect(tree.edits.length).to.equal(4);

				if (!localMode) {
					containerRuntimeFactory.processAllMessages();
				}

				// Undo testing
				const undoId: EditId = undo(undoTree, setValueId);

				if (!localMode) {
					containerRuntimeFactory.processAllMessages();
				}

				expect(tree.edits.length).to.equal(5);

				// Check the node whose value was set now has an empty payload
				const leftTraitAfterUndo = tree.currentView.getTrait({
					parent: initialTree.identifier,
					label: leftTraitLabel,
				});
				const nodeAfterUndo = tree.currentView.getSnapshotNode(leftTraitAfterUndo[1]);
				expect(nodeAfterUndo.payload).to.be.undefined;

				// Redo testing
				redo(undoTree, undoId);

				if (!localMode) {
					containerRuntimeFactory.processAllMessages();
				}

				expect(tree.edits.length).to.equal(6);

				// Check the inserted node was reinserted
				const leftTraitAfterRedo = tree.currentView.getTrait({
					parent: initialTree.identifier,
					label: leftTraitLabel,
				});
				const nodeAfterRedo = tree.currentView.getSnapshotNode(leftTraitAfterRedo[1]);
				expect(nodeAfterRedo.payload).equal(testPayload);
			});
		}
	});
}
