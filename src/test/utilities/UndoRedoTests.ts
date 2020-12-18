/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { v4 as uuidv4 } from 'uuid';
import { Definition, EditId, NodeId, TraitLabel } from '../../Identifiers';
import { makeEmptyNode, setUpTestSharedTree } from './TestUtilities';
import { Change, ChangeNode, StablePlace } from '../../PersistedTypes';

export interface SharedTreeTestOptions {
	/** Determines if the tests should be run in local state or connected state with a remote SharedTree */
	localMode: boolean;
}

/**
 * Runs revert tests for SharedTree
 */
export function runSharedTreeUndoRedoTestSuite(options: SharedTreeTestOptions): Mocha.Suite {
	const { localMode } = options;

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

	return describe('Revert', () => {
		it('works for Insert', () => {
			const { tree, containerRuntimeFactory } = setUpTestSharedTree(treeOptions);
			const secondTree = localMode
				? undefined
				: setUpTestSharedTree({ containerRuntimeFactory, ...secondTreeOptions }).tree;
			const undoTree = secondTree || tree;

			const newNode = makeEmptyNode();

			const insertId = tree.editor.insert(newNode, StablePlace.after(left));
			expect(tree.edits.length).to.equal(2);

			if (!localMode) {
				containerRuntimeFactory.processAllMessages();
			}

			// Undo testing
			const undoId: EditId = undoTree.editor.revert(insertId);

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
			undoTree.editor.revert(undoId);

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
			const { tree, containerRuntimeFactory } = setUpTestSharedTree(treeOptions);
			const secondTree = localMode
				? undefined
				: setUpTestSharedTree({ containerRuntimeFactory, ...secondTreeOptions }).tree;
			const undoTree = secondTree || tree;

			const newNode = makeEmptyNode();

			tree.editor.insert(newNode, StablePlace.after(left));
			const deleteId = tree.editor.delete(newNode);
			expect(tree.edits.length).to.equal(3);

			if (!localMode) {
				containerRuntimeFactory.processAllMessages();
			}

			// Undo testing
			const undoId: EditId = undoTree.editor.revert(deleteId);

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
			undoTree.editor.revert(undoId);

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

		// TODO:#46649: Enable tests once SetValue support is added
		it.skip('works for SetValue', () => {
			const { tree, containerRuntimeFactory } = setUpTestSharedTree(treeOptions);
			const secondTree = localMode
				? undefined
				: setUpTestSharedTree({ containerRuntimeFactory, ...secondTreeOptions }).tree;
			const undoTree = secondTree || tree;

			const newNode = makeEmptyNode();

			tree.editor.insert(newNode, StablePlace.after(left));
			const setValueId = tree.applyEdit(Change.setPayload(newNode.identifier, { base64: 'test' }));
			expect(tree.edits.length).to.equal(3);

			if (!localMode) {
				containerRuntimeFactory.processAllMessages();
			}

			// Undo testing
			const undoId: EditId = undoTree.editor.revert(setValueId);

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
			undoTree.editor.revert(undoId);

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
			expect(nodeAfterRedo.payload?.base64).to.equal('test');
		});

		it('works for out-of-order Insert', () => {
			const { tree, containerRuntimeFactory } = setUpTestSharedTree(treeOptions);
			const secondTree = localMode
				? undefined
				: setUpTestSharedTree({ containerRuntimeFactory, ...secondTreeOptions }).tree;
			const undoTree = secondTree || tree;

			const firstNode = makeEmptyNode();
			const secondNode = makeEmptyNode();

			const firstInsertId = tree.editor.insert(firstNode, StablePlace.after(left));
			tree.editor.insert(secondNode, StablePlace.after(left));
			expect(tree.edits.length).to.equal(3);

			if (!localMode) {
				containerRuntimeFactory.processAllMessages();
			}

			// Undo testing
			const undoId: EditId = undoTree.editor.revert(firstInsertId);

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
			undoTree.editor.revert(undoId);

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
			const { tree, containerRuntimeFactory } = setUpTestSharedTree(treeOptions);
			const secondTree = localMode
				? undefined
				: setUpTestSharedTree({ containerRuntimeFactory, ...secondTreeOptions }).tree;
			const undoTree = secondTree || tree;

			const firstNode = makeEmptyNode();
			const secondNode = makeEmptyNode();

			tree.editor.insert(firstNode, StablePlace.after(left));
			const deleteId = tree.editor.delete(firstNode);
			tree.editor.insert(secondNode, StablePlace.after(left));
			expect(tree.edits.length).to.equal(4);

			if (!localMode) {
				containerRuntimeFactory.processAllMessages();
			}

			// Undo testing
			const undoId: EditId = undoTree.editor.revert(deleteId);

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
			undoTree.editor.revert(undoId);

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

		// TODO:#46649: Enable tests once SetValue support is added
		it.skip('works for out-of-order SetValue', () => {
			const { tree, containerRuntimeFactory } = setUpTestSharedTree(treeOptions);
			const secondTree = localMode
				? undefined
				: setUpTestSharedTree({ containerRuntimeFactory, ...secondTreeOptions }).tree;
			const undoTree = secondTree || tree;

			const newNode = makeEmptyNode();

			tree.editor.insert(newNode, StablePlace.after(left));
			const setValueId = tree.applyEdit(Change.setPayload(newNode.identifier, { base64: 'test' }));
			expect(tree.edits.length).to.equal(3);

			if (!localMode) {
				containerRuntimeFactory.processAllMessages();
			}

			// Undo testing
			const undoId: EditId = undoTree.editor.revert(setValueId);

			if (!localMode) {
				containerRuntimeFactory.processAllMessages();
			}

			expect(tree.edits.length).to.equal(4);

			// Check the node whose value was set now has an empty payload
			const leftTraitAfterUndo = tree.currentView.getTrait({
				parent: initialTree.identifier,
				label: leftTraitLabel,
			});
			const nodeAfterUndo = tree.currentView.getSnapshotNode(leftTraitAfterUndo[0]);
			expect(nodeAfterUndo.payload).to.be.undefined;

			// Redo testing
			undoTree.editor.revert(undoId);

			if (!localMode) {
				containerRuntimeFactory.processAllMessages();
			}

			expect(tree.edits.length).to.equal(5);

			// Check the inserted node was reinserted
			const leftTraitAfterRedo = tree.currentView.getTrait({
				parent: initialTree.identifier,
				label: leftTraitLabel,
			});
			const nodeAfterRedo = tree.currentView.getSnapshotNode(leftTraitAfterRedo[0]);
			expect(nodeAfterRedo.payload?.base64).to.equal('test');
		});
	});
}
