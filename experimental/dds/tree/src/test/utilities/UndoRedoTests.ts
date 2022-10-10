/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MockContainerRuntimeFactory } from '@fluidframework/test-runtime-utils';
import { expect } from 'chai';
import { noop } from '../../Common';
import { DetachedSequenceId, EditId, NodeId } from '../../Identifiers';
import { TreeNodeHandle } from '../../TreeNodeHandle';
import { SharedTree } from '../../SharedTree';
import { Change, StablePlace, StableRange } from '../../ChangeTypes';
import { deepCompareNodes } from '../../EditUtilities';
import { NodeData } from '../../persisted-types';
import { expectDefined } from './TestCommon';
import { buildLeaf, TestTree } from './TestNode';
import { setUpTestSharedTree, setUpTestTree, translateId } from './TestUtilities';

/** Options used to generate a SharedTree undo/redo test suite. */
interface SharedTreeUndoRedoOptions {
	/** Determines if the tests should be run in local state or connected state with a remote SharedTree */
	localMode: boolean;
	/** Title used for the test suite describe block. */
	title: string;
	/** Function for undoing an edit on a given tree. */
	undo: (tree: SharedTree, editId: EditId) => EditId | undefined;
	/** Function for redoing an edit on a given tree. */
	redo: (tree: SharedTree, editId: EditId) => EditId | undefined;
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
export function runSharedTreeUndoRedoTestSuite(options: SharedTreeUndoRedoOptions): void {
	const { localMode, title, undo, redo, beforeEach: additionalSetup } = options;
	const afterEdit = options.afterEdit ?? noop;
	const testOutOfOrderRevert = options.testOutOfOrderRevert === undefined ? true : options.testOutOfOrderRevert;

	const treeOptions = {
		localMode,
		allowInvalid: true,
		allowMalformed: true,
	};

	const secondTreeOptions = {
		localMode,
		id: 'secondTestTree',
		allowInvalid: true,
	};

	describe(title, () => {
		let testTree: TestTree;
		let sharedTree: SharedTree;
		let undoSharedTree: SharedTree;
		let containerRuntimeFactory: MockContainerRuntimeFactory;

		function getTreeHandle() {
			return new TreeNodeHandle(sharedTree.currentView, testTree.identifier);
		}

		beforeEach(() => {
			const setupResult = setUpTestSharedTree(treeOptions);
			sharedTree = setupResult.tree;
			testTree = setUpTestTree(sharedTree);
			containerRuntimeFactory = setupResult.containerRuntimeFactory;
			const secondTree = localMode
				? undefined
				: setUpTestSharedTree({ containerRuntimeFactory, ...secondTreeOptions }).tree;
			undoSharedTree = secondTree ?? sharedTree;

			if (additionalSetup !== undefined) {
				if (secondTree !== undefined) {
					additionalSetup([sharedTree, undoSharedTree]);
				} else {
					additionalSetup([sharedTree]);
				}
			}
		});

		it('can detach and re-insert the same node', () => {
			const detachedId = 0 as DetachedSequenceId;
			const { id } = sharedTree.applyEdit(
				Change.detach(StableRange.only(testTree.left), detachedId),
				Change.insert(detachedId, StablePlace.atStartOf(testTree.left.traitLocation))
			);

			if (!localMode) {
				containerRuntimeFactory.processAllMessages();
			}

			expect(deepCompareNodes(getTreeHandle(), testTree)).to.be.true;

			const undoId: EditId = expectDefined(undo(sharedTree, id));
			if (!localMode) {
				containerRuntimeFactory.processAllMessages();
			}

			expect(deepCompareNodes(getTreeHandle(), testTree)).to.be.true;

			redo(sharedTree, undoId);
			if (!localMode) {
				containerRuntimeFactory.processAllMessages();
			}

			expect(deepCompareNodes(getTreeHandle(), testTree)).to.be.true;
		});

		it('works for Insert', () => {
			const newNode = testTree.buildLeaf();

			const { id } = sharedTree.applyEdit(...Change.insertTree(newNode, StablePlace.after(testTree.left)));
			afterEdit();
			expect(sharedTree.edits.length).to.equal(2);

			if (!localMode) {
				containerRuntimeFactory.processAllMessages();
			}

			// Undo testing
			const undoId: EditId = expectDefined(undo(undoSharedTree, id));

			if (!localMode) {
				containerRuntimeFactory.processAllMessages();
			}

			expect(sharedTree.edits.length).to.equal(3);

			// Check the inserted node was deleted
			const leftTraitAfterUndo = sharedTree.currentView.getTrait(testTree.left.traitLocation);
			expect(leftTraitAfterUndo.length).to.equal(1);

			// Redo testing
			redo(undoSharedTree, undoId);

			if (!localMode) {
				containerRuntimeFactory.processAllMessages();
			}

			expect(sharedTree.edits.length).to.equal(4);

			// Check the inserted node was reinserted
			const leftTraitAfterRedo = sharedTree.currentView.getTrait(testTree.left.traitLocation);
			expect(leftTraitAfterRedo.length).to.equal(2);
		});

		// Scope of detach code and fixtures
		{
			for (let startIndex = 0; startIndex < 8; ++startIndex) {
				for (let endIndex = startIndex; endIndex < 8; ++endIndex) {
					it(`works for Detach [${startIndex} -> ${endIndex}]`, () => {
						const leftTraitNodes = [
							testTree.buildLeaf(testTree.generateNodeId()),
							testTree.left,
							testTree.buildLeaf(testTree.generateNodeId()),
						];
						const places = leftTraitPlaces(testTree, leftTraitNodes);

						sharedTree.applyEdit(
							...Change.insertTree(leftTraitNodes[0], StablePlace.before(testTree.left))
						);
						afterEdit();
						sharedTree.applyEdit(...Change.insertTree(leftTraitNodes[2], StablePlace.after(testTree.left)));
						afterEdit();
						expect(sharedTree.currentView.getTrait(testTree.left.traitLocation).length).to.equal(3);

						const range = {
							start: places[startIndex].place,
							end: places[endIndex].place,
						};
						const countDetached = places[endIndex].index - places[startIndex].index;
						const { id } = sharedTree.applyEdit(Change.delete(range));
						afterEdit();

						expect(sharedTree.edits.length).to.equal(4);
						expect(sharedTree.currentView.getTrait(testTree.left.traitLocation).length).to.equal(
							3 - countDetached
						);

						if (!localMode) {
							containerRuntimeFactory.processAllMessages();
						}

						// Undo testing
						const undoId: EditId = expectDefined(undo(undoSharedTree, id));

						if (!localMode) {
							containerRuntimeFactory.processAllMessages();
						}

						expect(sharedTree.edits.length).to.equal(5);
						expect(sharedTree.currentView.getTrait(testTree.left.traitLocation).length).to.equal(3);

						// Redo testing
						redo(undoSharedTree, undoId);

						if (!localMode) {
							containerRuntimeFactory.processAllMessages();
						}

						expect(sharedTree.edits.length).to.equal(6);
						expect(sharedTree.currentView.getTrait(testTree.left.traitLocation).length).to.equal(
							3 - countDetached
						);
					});
				}
			}
		}

		it('works for SetValue', () => {
			const newNode = testTree.buildLeaf(testTree.generateNodeId());

			sharedTree.applyEdit(...Change.insertTree(newNode, StablePlace.after(testTree.left)));
			afterEdit();
			const testPayload = 5;
			const { id } = sharedTree.applyEdit(Change.setPayload(newNode.identifier, testPayload));
			afterEdit();
			expect(sharedTree.edits.length).to.equal(3);

			if (!localMode) {
				containerRuntimeFactory.processAllMessages();
			}

			// Undo testing
			const undoId: EditId = expectDefined(undo(undoSharedTree, id));

			if (!localMode) {
				containerRuntimeFactory.processAllMessages();
			}

			expect(sharedTree.edits.length).to.equal(4);

			// Check the node whose value was set now has an empty payload
			const leftTraitAfterUndo = sharedTree.currentView.getTrait(testTree.left.traitLocation);
			const nodeAfterUndo = sharedTree.currentView.getViewNode(leftTraitAfterUndo[1]);
			expect(nodeAfterUndo.payload).to.be.undefined;

			// Redo testing
			redo(undoSharedTree, undoId);

			if (!localMode) {
				containerRuntimeFactory.processAllMessages();
			}

			expect(sharedTree.edits.length).to.equal(5);

			// Check the inserted node was reinserted
			const leftTraitAfterRedo = sharedTree.currentView.getTrait(testTree.left.traitLocation);
			const nodeAfterRedo = sharedTree.currentView.getViewNode(leftTraitAfterRedo[1]);
			expect(nodeAfterRedo.payload).equal(testPayload);
		});

		it('works for conflicting edits', () => {
			const newNodeId = sharedTree.generateNodeId();
			const newNode = buildLeaf(newNodeId);
			sharedTree.applyEdit(...Change.insertTree(newNode, StablePlace.atStartOf(testTree.left.traitLocation)));
			containerRuntimeFactory.processAllMessages();

			// First tree deletes the new node under left trait
			sharedTree.applyEdit(Change.detach(StableRange.only(newNode)));
			afterEdit();

			// Second tree also deletes new left node
			const translatedNodeId = translateId(newNodeId, sharedTree, undoSharedTree);
			const { id } = undoSharedTree.applyEdit(Change.detach(StableRange.only(translatedNodeId)));
			afterEdit();

			// Synchronize; the first tree's edit will apply but the second tree's will be invalid
			if (!localMode) {
				containerRuntimeFactory.processAllMessages();
			}

			// The undo should succeed but do nothing
			undo(undoSharedTree, id);

			// Check that the undo had no effect
			const traitAfterUndo = sharedTree.currentView.getTrait(testTree.left.traitLocation);
			expect(traitAfterUndo.length).equals(1);
		});

		if (testOutOfOrderRevert === true) {
			it('works for out-of-order Insert', () => {
				const firstNode = testTree.buildLeaf();
				const secondNode = testTree.buildLeaf(testTree.generateNodeId());

				const { id } = sharedTree.applyEdit(...Change.insertTree(firstNode, StablePlace.after(testTree.left)));
				afterEdit();
				sharedTree.applyEdit(...Change.insertTree(secondNode, StablePlace.after(testTree.left)));
				afterEdit();
				expect(sharedTree.edits.length).to.equal(3);

				if (!localMode) {
					containerRuntimeFactory.processAllMessages();
				}

				// Undo testing
				const undoId: EditId = expectDefined(undo(undoSharedTree, id));

				if (!localMode) {
					containerRuntimeFactory.processAllMessages();
				}

				const editsAfterUndo = sharedTree.edits;
				expect(editsAfterUndo.length).to.equal(4);

				const leftTraitAfterUndo = sharedTree.currentView.getTrait(testTree.left.traitLocation);
				expect(leftTraitAfterUndo.length).to.equal(2);

				// Check that the node under the left trait is the second node
				const nodeAfterUndo = sharedTree.currentView.getViewNode(leftTraitAfterUndo[1]);
				expect(nodeAfterUndo.identifier).to.equal(secondNode.identifier);

				// Redo testing
				redo(undoSharedTree, undoId);

				if (!localMode) {
					containerRuntimeFactory.processAllMessages();
				}

				expect(sharedTree.edits.length).to.equal(5);

				const leftTraitAfterRedo = sharedTree.currentView.getTrait(testTree.left.traitLocation);
				expect(leftTraitAfterRedo.length).to.equal(3);
			});

			it('works for out-of-order Detach', () => {
				const firstNode = testTree.buildLeaf(testTree.generateNodeId());
				const secondNode = testTree.buildLeaf();

				sharedTree.applyEdit(...Change.insertTree(firstNode, StablePlace.after(testTree.left)));
				afterEdit();
				const { id } = sharedTree.applyEdit(Change.delete(StableRange.only(firstNode)));
				afterEdit();
				sharedTree.applyEdit(...Change.insertTree(secondNode, StablePlace.after(testTree.left)));
				afterEdit();
				expect(sharedTree.edits.length).to.equal(4);

				if (!localMode) {
					containerRuntimeFactory.processAllMessages();
				}

				// Undo testing
				const undoId: EditId = expectDefined(undo(undoSharedTree, id));

				if (!localMode) {
					containerRuntimeFactory.processAllMessages();
				}

				expect(sharedTree.edits.length).to.equal(5);

				const leftTraitAfterUndo = sharedTree.currentView.getTrait(testTree.left.traitLocation);
				expect(leftTraitAfterUndo.length).to.equal(3);

				// Check the first node is the second one under the left trait
				const nodeAfterUndo = sharedTree.currentView.getViewNode(leftTraitAfterUndo[1]);
				expect(nodeAfterUndo.identifier).to.equal(firstNode.identifier);

				// Redo testing
				redo(undoSharedTree, undoId);

				if (!localMode) {
					containerRuntimeFactory.processAllMessages();
				}

				expect(sharedTree.edits.length).to.equal(6);

				const leftTraitAfterRedo = sharedTree.currentView.getTrait(testTree.left.traitLocation);
				expect(leftTraitAfterRedo.length).to.equal(2);
			});

			it('works for out-of-order SetValue', () => {
				const newNode = testTree.buildLeaf(testTree.generateNodeId());

				sharedTree.applyEdit(...Change.insertTree(newNode, StablePlace.after(testTree.left)));
				afterEdit();
				const testPayload = 10;
				const { id } = sharedTree.applyEdit(Change.setPayload(newNode.identifier, testPayload));
				afterEdit();
				sharedTree.applyEdit(...Change.insertTree(newNode, StablePlace.after(testTree.left)));
				afterEdit();
				expect(sharedTree.edits.length).to.equal(4);

				if (!localMode) {
					containerRuntimeFactory.processAllMessages();
				}

				// Undo testing
				const undoId: EditId = expectDefined(undo(undoSharedTree, id));

				if (!localMode) {
					containerRuntimeFactory.processAllMessages();
				}

				expect(sharedTree.edits.length).to.equal(5);

				// Check the node whose value was set now has an empty payload
				const leftTraitAfterUndo = sharedTree.currentView.getTrait(testTree.left.traitLocation);
				const nodeAfterUndo = sharedTree.currentView.getViewNode(leftTraitAfterUndo[1]);
				expect(nodeAfterUndo.payload).to.be.undefined;

				// Redo testing
				redo(undoSharedTree, undoId);

				if (!localMode) {
					containerRuntimeFactory.processAllMessages();
				}

				expect(sharedTree.edits.length).to.equal(6);

				// Check the inserted node was reinserted
				const leftTraitAfterRedo = sharedTree.currentView.getTrait(testTree.left.traitLocation);
				const nodeAfterRedo = sharedTree.currentView.getViewNode(leftTraitAfterRedo[1]);
				expect(nodeAfterRedo.payload).equal(testPayload);
			});
		}
	});
}

/**
 * Generate all possible places in the given trait
 */
function leftTraitPlaces(testTree: TestTree, trait: NodeData<NodeId>[]): { index: number; place: StablePlace }[] {
	const places: { index: number; place: StablePlace }[] = [];
	places.push({ index: 0, place: StablePlace.atStartOf(testTree.left.traitLocation) });
	for (let i = 0; i < trait.length; i++) {
		places.push({ index: i, place: StablePlace.before(trait[i]) });
		places.push({ index: i + 1, place: StablePlace.after(trait[i]) });
	}
	places.push({ index: 3, place: StablePlace.atEndOf(testTree.left.traitLocation) });
	return places;
}
