/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, expect } from 'chai';
import { ITelemetryBaseEvent } from '@fluidframework/common-definitions';
import { ISequencedDocumentMessage } from '@fluidframework/protocol-definitions';
import {
	MockContainerRuntime,
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
} from '@fluidframework/test-runtime-utils';
import { assertArrayOfOne, assertNotUndefined, isSharedTreeEvent } from '../../Common';
import { Definition, DetachedSequenceId, EditId, TraitLabel } from '../../Identifiers';
import { CachingLogViewer } from '../../LogViewer';
import { EditLog, OrderedEditSet } from '../../EditLog';
import { initialTree } from '../../InitialTree';
import { TreeNodeHandle } from '../../TreeNodeHandle';
import { deserialize } from '../../SummaryBackCompatibility';
import { useFailedSequencedEditTelemetry } from '../../MergeHealth';
import { StringInterner } from '../../StringInterner';
import { getChangeNodeFromView } from '../../SerializationUtilities';
import { EditCommittedEventArguments, SequencedEditAppliedEventArguments, SharedTree } from '../../SharedTree';
import {
	ChangeInternal,
	EditStatus,
	SharedTreeSummary,
	SharedTreeSummaryBase,
	SharedTreeSummary_0_0_2,
	WriteFormat,
} from '../../persisted-types';
import { getSharedTreeEncoder } from '../../SharedTreeEncoder';
import { SharedTreeEvent } from '../../EventTypes';
import { BuildNode, Change, ChangeType, Delete, Insert, Move, StablePlace, StableRange } from '../../ChangeTypes';
import { deepCompareNodes, newEdit } from '../../EditUtilities';
import { serialize } from '../../Summary';
import { TreeCompressor_0_1_1 } from '../../TreeCompressor';
import { buildLeaf, TestTree } from './TestNode';
import { TestFluidHandle, TestFluidSerializer } from './TestSerializer';
import { runSharedTreeUndoRedoTestSuite } from './UndoRedoTests';
import {
	areNodesEquivalent,
	assertNoDelta,
	SharedTreeTestingComponents,
	SharedTreeTestingOptions,
	setUpTestTree,
	testTrait,
	testTraitLabel,
	translateId,
} from './TestUtilities';

function revertEditInTree(tree: SharedTree, edit: EditId): EditId | undefined {
	return tree.revert(edit);
}

// Options for the undo/redo test suite. The undo and redo functions are the same.
const undoRedoOptions = {
	title: 'Revert',
	undo: revertEditInTree,
	redo: revertEditInTree,
};

/**
 * Runs a test suite for operations on `SharedTree` writing ops at `writeFormat`.
 * This suite can be used to test other implementations that aim to fulfill `SharedTree`'s contract.
 */
export function runSharedTreeOperationsTests(
	title: string,
	writeFormat: WriteFormat,
	setUpTestSharedTreeWithDefaultVersion: (options?: SharedTreeTestingOptions) => SharedTreeTestingComponents
) {
	const setUpTestSharedTree: typeof setUpTestSharedTreeWithDefaultVersion = (options) =>
		setUpTestSharedTreeWithDefaultVersion({ writeFormat, ...options });

	const encoder = getSharedTreeEncoder(writeFormat, true);
	/**
	 * Convenience bundling of test components.
	 * Like {@link SharedTreeTestingComponents}, but contains both the {@link SimpleTestTree} and
	 * its associated {@link TSharedTree}.
	 */
	interface SharedTreeTest {
		/**
		 * {@inheritDoc SharedTreeTestingComponents.tree}
		 */
		sharedTree: SharedTree;

		/**
		 * {@link SimpleTestTree} corresponding to {@link SharedTreeTest.sharedTree}
		 */
		testTree: TestTree;

		/**
		 * {@inheritDoc SharedTreeTestingComponents.componentRuntime}
		 */
		componentRuntime: MockFluidDataStoreRuntime;

		/**
		 * {@inheritDoc SharedTreeTestingComponents.containerRuntimeFactory}
		 */
		containerRuntimeFactory: MockContainerRuntimeFactory;
	}

	function createSimpleTestTree(options?: SharedTreeTestingOptions): SharedTreeTest {
		const { tree: sharedTree, componentRuntime, containerRuntimeFactory } = setUpTestSharedTree(options);
		const testTree = setUpTestTree(sharedTree);
		return { sharedTree, testTree, componentRuntime, containerRuntimeFactory };
	}

	describe(title, () => {
		const testSerializer = new TestFluidSerializer();

		describe('SharedTree before initialization', () => {
			it('can create a new SharedTree', () => {
				const { tree } = setUpTestSharedTree();
				expect(tree).to.not.be.undefined;
			});

			it('valid without initial tree', () => {
				const { tree } = setUpTestSharedTree();
				expect(tree.currentView.getTrait(testTrait(tree.currentView))).deep.equals(
					[],
					'Root should exist, and child traits should be valid but empty.'
				);
			});
		});

		describe('SharedTree in local state', () => {
			it('does not emit change events for each change in a batch of changes', () => {
				const { sharedTree, testTree } = createSimpleTestTree();

				let changeCount = 0;
				sharedTree.on(SharedTreeEvent.EditCommitted, () => {
					const leftTrait = sharedTree.currentView.getTrait(testTree.left.traitLocation);
					const rightTrait = sharedTree.currentView.getTrait(testTree.right.traitLocation);

					expect(leftTrait.length).to.equal(0); // "left" child is deleted...
					expect(rightTrait.length).to.equal(2); // ...and added to "right" trait

					changeCount += 1;
				});

				sharedTree.applyEdit(
					...Move.create(StableRange.only(testTree.left), StablePlace.after(testTree.right))
				);
				expect(changeCount).equals(1);
			});

			it('can insert a wrapped tree', () => {
				const { sharedTree, testTree } = createSimpleTestTree();

				const childNode = testTree.buildLeaf(testTree.generateNodeId());
				const childId = 0 as DetachedSequenceId;
				const childrenTraitLabel = 'children' as TraitLabel;
				const parentNode = {
					identifier: testTree.generateNodeId(),
					definition: 'node' as Definition,
					traits: {
						[childrenTraitLabel]: [childId],
					},
				};
				const parentId = 1 as DetachedSequenceId;

				const buildChild = Change.build([childNode], childId);
				const buildParent = Change.build([parentNode], parentId);
				const insertParent = Change.insert(parentId, StablePlace.before(testTree.left));

				sharedTree.applyEdit(buildChild, buildParent, insertParent);

				const leftTrait = sharedTree.currentView.getTrait(testTree.left.traitLocation);
				expect(leftTrait.length).to.equal(2);
				expect(leftTrait[0]).to.equal(parentNode.identifier);
				const childrenTrait = sharedTree.currentView.getTrait({
					parent: parentNode.identifier,
					label: childrenTraitLabel,
				});
				expect(childrenTrait.length).to.equal(1);
				expect(childrenTrait[0]).to.equal(childNode.identifier);
			});

			it('prevents multi-parenting detached trees', () => {
				const { sharedTree, testTree } = createSimpleTestTree({ allowMalformed: true });

				const childNode = testTree.buildLeaf();
				const childId = 0 as DetachedSequenceId;
				const childrenTraitLabel = 'children' as TraitLabel;
				const parentNode: BuildNode = {
					identifier: testTree.generateNodeId(),
					definition: 'node' as Definition,
					traits: {
						[childrenTraitLabel]: [childId],
					},
				};
				const parentId = 1 as DetachedSequenceId;
				const parentNode2: BuildNode = {
					identifier: testTree.generateNodeId(),
					definition: 'node' as Definition,
					traits: {
						[childrenTraitLabel]: [childId],
					},
				};
				const parentId2 = 2 as DetachedSequenceId;

				const buildChild = Change.build([childNode], childId);
				const buildParent = Change.build([parentNode], parentId);
				const buildParent2 = Change.build([parentNode2], parentId2);

				assertNoDelta(sharedTree, () => {
					// we don't expect this edit application to change anything
					sharedTree.applyEdit(buildChild, buildParent, buildParent2);
				});
			});

			// TODO:#58052: Make this test pass.
			it.skip('prevents setting the value of a node in a detached subtree', () => {
				const { sharedTree, testTree } = createSimpleTestTree({ allowInvalid: true });

				const detachedNode = testTree.buildLeaf(testTree.generateNodeId());
				const detachedSequenceId = 0 as DetachedSequenceId;
				const { id } = sharedTree.applyEdit(
					Change.build([detachedNode], detachedSequenceId),
					Change.setPayload(detachedNode.identifier, 42),
					Change.insert(detachedSequenceId, StablePlace.before(testTree.left))
				);
				const logViewer = sharedTree.logViewer as CachingLogViewer;
				expect(logViewer.getEditResultInSession(logViewer.log.getIndexOfId(id)).status).equals(
					EditStatus.Invalid
				);
				sharedTree.currentView.assertConsistent();
			});

			// TODO:#58052: Make this test pass.
			it.skip('prevents inserting a node in a detached subtree through a local edit', () => {
				const { sharedTree, testTree } = createSimpleTestTree({ allowInvalid: true });

				const detachedNewNode = testTree.buildLeaf();
				const detachedNewNodeSequenceId = 0 as DetachedSequenceId;
				const detachedRightNodeSequenceId = 1 as DetachedSequenceId;
				const { id } = sharedTree.applyEdit(
					Change.build([detachedNewNode], detachedNewNodeSequenceId),
					Change.detach(StableRange.only(testTree.right), detachedRightNodeSequenceId),
					// This change attempts to insert a node under a detached node
					Change.insert(
						detachedNewNodeSequenceId,
						StablePlace.atStartOf({ parent: testTree.right.identifier, label: 'foo' as TraitLabel })
					),
					Change.insert(detachedRightNodeSequenceId, StablePlace.before(testTree.left))
				);
				const logViewer = sharedTree.logViewer as CachingLogViewer;
				expect(logViewer.getEditResultInSession(logViewer.log.getIndexOfId(id)).status).equals(
					EditStatus.Invalid
				);
				sharedTree.currentView.assertConsistent();
			});

			it('prevents deletion of the root', () => {
				const { sharedTree } = createSimpleTestTree({ allowInvalid: true });
				const rootId = sharedTree.convertToNodeId(initialTree.identifier);
				expect(sharedTree.currentView.hasNode(rootId));
				assertNoDelta(sharedTree, () => {
					// Try to delete the root
					sharedTree.applyEdit(Delete.create(StableRange.only(rootId)));
				});
			});

			it('can apply multiple local edits without ack from server', () => {
				const { sharedTree, testTree } = createSimpleTestTree();

				const newNode = testTree.buildLeaf(testTree.generateNodeId());

				sharedTree.applyEdit(...Insert.create([newNode], StablePlace.after(testTree.left)));
				sharedTree.applyEdit(...Move.create(StableRange.only(newNode), StablePlace.before(testTree.left)));

				const leftTrait = sharedTree.currentView.getTrait(testTree.left.traitLocation);
				expect(leftTrait.length).equals(2);
				expect(leftTrait[0]).equals(newNode.identifier);
			});

			it('is not equal to a tree with different current views', () => {
				const { sharedTree: sharedTree1 } = createSimpleTestTree();
				const { tree: sharedTree2 } = setUpTestSharedTree();
				expect(sharedTree1.equals(sharedTree2)).to.be.false;
			});

			it('is not equal to a tree with the same current view but different edit logs', () => {
				const { sharedTree: sharedTree1 } = createSimpleTestTree();
				const { sharedTree: sharedTree2 } = createSimpleTestTree();

				// The edits that create the initial tree have different identities.
				expect(sharedTree1.equals(sharedTree2)).to.be.false;
			});

			it('tolerates invalid inserts', () => {
				const { sharedTree, testTree } = createSimpleTestTree({ allowInvalid: true });

				const firstNode = testTree.buildLeaf(testTree.generateNodeId());
				const secondNode = testTree.buildLeaf(testTree.generateNodeId());

				sharedTree.applyEdit(...Insert.create([firstNode], StablePlace.after(testTree.left)));
				sharedTree.applyEdit(Delete.create(StableRange.only(firstNode)));

				// Trying to insert next to the deleted node should drop, confirm that it doesn't
				// change the view
				assertNoDelta(sharedTree, () => {
					sharedTree.applyEdit(...Insert.create([secondNode], StablePlace.after(firstNode)));
				});

				const leftTrait = sharedTree.currentView.getTrait(testTree.left.traitLocation);
				expect(leftTrait.length).to.equal(1);
			});

			it('tolerates invalid detaches', () => {
				const { sharedTree, testTree } = createSimpleTestTree({ allowInvalid: true });

				const firstNode = testTree.buildLeaf(testTree.generateNodeId());
				const secondNode = testTree.buildLeaf(testTree.generateNodeId());
				const thirdNode = testTree.buildLeaf(testTree.generateNodeId());

				sharedTree.applyEdit(
					...Insert.create([firstNode, secondNode, thirdNode], StablePlace.after(testTree.left))
				);
				sharedTree.applyEdit(Delete.create(StableRange.only(secondNode)));

				assertNoDelta(sharedTree, () => {
					// Trying to delete from before firstNode to after secondNode should drop
					sharedTree.applyEdit(
						Delete.create(StableRange.from(StablePlace.before(firstNode)).to(StablePlace.after(secondNode)))
					);

					// Trying to delete from after thirdNode to before firstNode should drop
					sharedTree.applyEdit(
						Delete.create(StableRange.from(StablePlace.after(thirdNode)).to(StablePlace.before(firstNode)))
					);
				});

				// Expect that firstNode did not get deleted
				const leftTrait = sharedTree.currentView.getTrait(testTree.left.traitLocation);
				expect(leftTrait.length).to.equal(3);
			});

			it('tolerates malformed inserts', () => {
				const { sharedTree } = createSimpleTestTree({ allowMalformed: true });

				assertNoDelta(sharedTree, () => {
					sharedTree.applyEdit(Change.build([], 0 as DetachedSequenceId));
				});
			});

			runSharedTreeUndoRedoTestSuite({ localMode: true, ...undoRedoOptions });
		});

		describe('SharedTree in connected state with a remote SharedTree', () => {
			/**
			 * Initial tree options for multi-tree tests below.
			 * Intended to be passed to {@link createSimpleTestTree}.
			 */
			const tree1Options = { localMode: false };

			/**
			 * Secondary tree options derived from some initial tree.
			 */
			function createSecondTreeOptions(
				containerRuntimeFactory: MockContainerRuntimeFactory
			): SharedTreeTestingOptions {
				return {
					containerRuntimeFactory,
					id: 'secondTestSharedTree',
					localMode: false,
				};
			}

			it('should apply remote changes and converge', () => {
				const { tree: sharedTree1, containerRuntimeFactory } = setUpTestSharedTree(tree1Options);
				const { tree: sharedTree2 } = setUpTestSharedTree(createSecondTreeOptions(containerRuntimeFactory));

				const newNodeId1 = sharedTree1.generateNodeId();
				sharedTree1.applyEdit(
					...Insert.create([buildLeaf(newNodeId1)], StablePlace.atStartOf(testTrait(sharedTree1.currentView)))
				);

				// Sync initial tree
				containerRuntimeFactory.processAllMessages();

				const newNodeId2 = translateId(newNodeId1, sharedTree1, sharedTree2);

				// Both trees should contain 'left'
				expect(sharedTree1.currentView.getViewNode(newNodeId1)).to.not.be.undefined;
				expect(sharedTree2.currentView.getViewNode(newNodeId2)).to.not.be.undefined;

				sharedTree2.applyEdit(Delete.create(StableRange.only(newNodeId2)));

				containerRuntimeFactory.processAllMessages();

				const rootA = sharedTree1.currentView.getViewNode(sharedTree1.currentView.root);
				expect(rootA.traits.get(testTraitLabel)).to.be.undefined;

				const rootB = sharedTree2.currentView.getViewNode(sharedTree2.currentView.root);
				expect(rootB.traits.get(testTraitLabel)).to.be.undefined;
			});

			it('converges in the face of concurrent changes', () => {
				const { tree: sharedTree1, containerRuntimeFactory } = setUpTestSharedTree(tree1Options);
				const { sharedTree: sharedTree2 } = createSimpleTestTree(
					createSecondTreeOptions(containerRuntimeFactory)
				);

				const newNodeId1 = sharedTree1.generateNodeId();
				sharedTree1.applyEdit(
					...Insert.create([buildLeaf(newNodeId1)], StablePlace.atStartOf(testTrait(sharedTree1.currentView)))
				);
				containerRuntimeFactory.processAllMessages();

				// First client deletes a trait containing a node in the initial tree
				sharedTree1.applyEdit(Delete.create(StableRange.all(testTrait(sharedTree1.currentView))));

				// Second client concurrently adds a new node to that trait
				const newNodeId2 = sharedTree2.generateNodeId();
				sharedTree2.applyEdit(
					...Insert.create([buildLeaf(newNodeId2)], StablePlace.atStartOf(testTrait(sharedTree2.currentView)))
				);

				containerRuntimeFactory.processAllMessages();

				// Second client's change gets sequenced after the deletion, so the trait
				// should exist and contain the second new node on both clients after messages are delivered.
				const leftTrait = sharedTree1.currentView.getTrait(testTrait(sharedTree1.currentView));
				const secondLeftTrait = sharedTree2.currentView.getTrait(testTrait(sharedTree2.currentView));
				expect(leftTrait.length).equals(1);
				expect(leftTrait[0]).equals(newNodeId2);
				expect(leftTrait).deep.equals(secondLeftTrait);
			});

			it('is equal to a tree with the same state', () => {
				const { tree: sharedTree1, containerRuntimeFactory } = setUpTestSharedTree(tree1Options);
				const { tree: sharedTree2 } = setUpTestSharedTree(createSecondTreeOptions(containerRuntimeFactory));
				const newNodeId1 = sharedTree1.generateNodeId();
				sharedTree1.applyEdit(
					...Insert.create(
						[
							{
								identifier: newNodeId1,
								definition: 'foo' as Definition,
								traits: { left: [buildLeaf()], right: [buildLeaf()] },
							},
						],
						StablePlace.atStartOf(testTrait(sharedTree1.currentView))
					)
				);
				containerRuntimeFactory.processAllMessages();
				expect(sharedTree1.equals(sharedTree2)).to.be.true;
				sharedTree2.applyEdit(
					Delete.create(StableRange.only(translateId(newNodeId1, sharedTree1, sharedTree2)))
				);
				containerRuntimeFactory.processAllMessages();
				expect(sharedTree1.equals(sharedTree2)).to.be.true;
			});

			// TODO:#58052: Make this test pass.
			it.skip('prevents inserting a node in a detached subtree as the result of merged edits', () => {
				const { testTree } = createSimpleTestTree();

				const rootNode = testTree.buildLeaf(testTree.generateNodeId());

				const parent1Node = testTree.buildLeaf(testTree.generateNodeId());

				const parent2Node = testTree.buildLeaf(testTree.generateNodeId());
				const parent2Id = parent2Node.identifier;

				const childNode = testTree.buildLeaf(testTree.generateNodeId());
				const childId = childNode.identifier;

				const initialTree = {
					...rootNode,
					traits: {
						parents: [
							{
								...parent1Node,
								traits: { child: [childNode] },
							},
							parent2Node,
						],
					},
				};

				const childTraitUnderParent2 = { parent: parent2Id, label: 'child' as TraitLabel };
				const badTraitUnderChild = { parent: childId, label: 'whatever' as TraitLabel };

				const { tree: sharedTree1, containerRuntimeFactory } = setUpTestSharedTree({
					...tree1Options,
					initialTree,
					allowInvalid: true,
				});
				const { tree: sharedTree2 } = setUpTestSharedTree({
					...createSecondTreeOptions(containerRuntimeFactory),
					allowInvalid: true,
				});
				containerRuntimeFactory.processAllMessages();

				// Move the child under parent2
				// This first edit should succeed locally and globally
				const edit1 = sharedTree1.applyEdit(
					...Move.create(StableRange.only(childId), StablePlace.atStartOf(childTraitUnderParent2))
				);

				// Concurrently move parent2 under child
				// This first edit should succeed locally but fail globally
				const edit2 = sharedTree2.applyEdit(
					...Move.create(StableRange.only(parent2Id), StablePlace.atStartOf(badTraitUnderChild))
				);

				containerRuntimeFactory.processAllMessages();
				const logViewer = sharedTree1.logViewer as CachingLogViewer;
				expect(logViewer.getEditResultInSession(logViewer.log.getIndexOfId(edit1.id)).status).equals(
					EditStatus.Applied
				);
				expect(logViewer.getEditResultInSession(logViewer.log.getIndexOfId(edit2.id)).status).equals(
					EditStatus.Invalid
				);
				sharedTree1.currentView.assertConsistent();
			});

			it('tolerates invalid inserts', () => {
				const { tree: sharedTree1, containerRuntimeFactory } = setUpTestSharedTree({
					...tree1Options,
					allowInvalid: true,
				});
				const { tree: sharedTree2 } = setUpTestSharedTree({
					...createSecondTreeOptions(containerRuntimeFactory),
					allowInvalid: true,
				});

				containerRuntimeFactory.processAllMessages();

				const firstNode2 = buildLeaf(sharedTree2.generateNodeId());
				const firstEdit = sharedTree2.applyEdit(
					...Insert.create([firstNode2], StablePlace.atStartOf(testTrait(sharedTree2.currentView)))
				);
				containerRuntimeFactory.processAllMessages();

				// Concurrently edit, creating invalid insert.
				// Create delete. This will apply.
				const secondEdit = sharedTree1.applyEdit(
					Delete.create(StableRange.only(translateId(firstNode2, sharedTree2, sharedTree1)))
				);

				let thirdEdit;
				assertNoDelta(sharedTree1, () => {
					// concurrently insert next to the deleted node: this will become invalid.
					const secondNode2 = buildLeaf();
					thirdEdit = sharedTree2.applyEdit(...Insert.create([secondNode2], StablePlace.after(firstNode2)));
					containerRuntimeFactory.processAllMessages();
				});

				const leftTrait = sharedTree2.currentView.getTrait(testTrait(sharedTree2.currentView));
				expect(leftTrait.length).to.equal(0);

				const editIds = sharedTree1.edits.editIds;

				expect(editIds[0]).is.equal(firstEdit.id);
				expect(editIds[1]).is.equal(secondEdit.id);
				expect(editIds[2]).is.equal(thirdEdit.id);
			});

			it('tolerates invalid detaches', () => {
				const { tree: sharedTree1, containerRuntimeFactory } = setUpTestSharedTree({
					...tree1Options,
					allowInvalid: true,
				});
				const { tree: sharedTree2 } = setUpTestSharedTree(createSecondTreeOptions(containerRuntimeFactory));

				containerRuntimeFactory.processAllMessages();

				const firstNode2 = buildLeaf(sharedTree2.generateNodeId());
				const secondNode2 = buildLeaf(sharedTree2.generateNodeId());
				const thirdNode = buildLeaf();
				const firstEdit = sharedTree2.applyEdit(
					...Insert.create(
						[firstNode2, secondNode2, thirdNode],
						StablePlace.atStartOf(testTrait(sharedTree2.currentView))
					)
				);
				containerRuntimeFactory.processAllMessages();

				// Create delete. This will apply.
				const secondEdit = sharedTree1.applyEdit(
					Delete.create(StableRange.only(translateId(secondNode2, sharedTree2, sharedTree1)))
				);

				// concurrently delete from before firstNode to after secondNode: this should become invalid
				const thirdEdit = sharedTree2.applyEdit(
					Delete.create(StableRange.from(StablePlace.before(firstNode2)).to(StablePlace.after(secondNode2)))
				);

				containerRuntimeFactory.processAllMessages();

				// Expect that firstNode did not get deleted
				const leftTrait = sharedTree1.currentView.getTrait(testTrait(sharedTree1.currentView));
				expect(leftTrait.length).to.equal(2);

				const editIds = sharedTree1.edits.editIds;
				expect(editIds[0]).to.equal(firstEdit.id);
				expect(editIds[1]).to.equal(secondEdit.id);
				expect(editIds[2]).to.equal(thirdEdit.id);
			});

			it('tolerates malformed inserts', () => {
				const { sharedTree: sharedTree1, containerRuntimeFactory } = createSimpleTestTree({
					...tree1Options,
					allowMalformed: true,
				});
				const { tree: sharedTree2 } = setUpTestSharedTree(createSecondTreeOptions(containerRuntimeFactory));

				containerRuntimeFactory.processAllMessages();

				let editId!: EditId;
				assertNoDelta(sharedTree1, () => {
					const build = Change.build([], 0 as DetachedSequenceId);
					editId = sharedTree2.applyEdit(build).id;
					containerRuntimeFactory.processAllMessages();
				});

				// Edit 0 creates initial tree
				expect(sharedTree1.edits.getIdAtIndex(1)).to.equal(editId);
			});

			runSharedTreeUndoRedoTestSuite({ localMode: false, ...undoRedoOptions });

			// This is a regression test for documents corrupted by the following github issue:
			// https://github.com/microsoft/FluidFramework/issues/4399
			it('tolerates duplicate edits in trailing operations', () => {
				const { sharedTree: sharedTree1, containerRuntimeFactory } = createSimpleTestTree(tree1Options);
				const remoteRuntime = containerRuntimeFactory.createContainerRuntime(new MockFluidDataStoreRuntime());
				const defaultEdits = sharedTree1.edits.length;
				const edit = newEdit([]);
				for (let submissions = 0; submissions < 2; submissions++) {
					const op = encoder.encodeEditOp(edit, (obj) => obj);
					remoteRuntime.submit(op, /* localOpMetadata */ undefined);
				}
				containerRuntimeFactory.processAllMessages();
				expect(sharedTree1.edits.length).to.equal(defaultEdits + 1);
			});
		});

		describe('SharedTree summarizing', () => {
			const testHandle = new TestFluidHandle();

			it('throws error when given bad json input', () => {
				assert.throws(() => deserialize('', testSerializer));
				assert.throws(() => deserialize('~ malformed JSON ~', testSerializer));
				assert.throws(() => deserialize('{ unrecognizedKey: 42 }', testSerializer));
			});

			it('correctly handles snapshots of default trees', () => {
				const { tree: uninitializedTree } = setUpTestSharedTree();

				// Serialize the state of one uninitialized tree into a second tree
				const serialized = serialize(uninitializedTree.saveSummary(), testSerializer, testHandle);
				const parsedTree = deserialize(serialized, testSerializer);
				if (writeFormat === WriteFormat.v0_0_2) {
					const summary = parsedTree as SharedTreeSummary_0_0_2<unknown>;
					expect(summary.sequencedEdits).to.deep.equal([]);
					expect(deepCompareNodes(summary.currentTree, initialTree)).to.be.true;
				} else {
					const summary = parsedTree as SharedTreeSummary<unknown>;
					expect(summary.editHistory).to.deep.equal({ editChunks: [], editIds: [] });
					expect(summary.currentTree).to.be.instanceOf(Array);
					expect(summary.internedStrings).to.have.length(1);
				}
			});

			[true, false].forEach((hasLocalEdits) => {
				it(`produces correct snapshot for a tree with ${hasLocalEdits ? 'local' : 'acked'} edits`, async () => {
					// The initial tree results in an edit.
					const { sharedTree, testTree, containerRuntimeFactory } = createSimpleTestTree({
						localMode: hasLocalEdits,
					});

					const newNode = testTree.buildLeaf();
					sharedTree.applyEdit(...Insert.create([newNode], StablePlace.before(testTree.left)));
					if (!hasLocalEdits) {
						containerRuntimeFactory.processAllMessages();
					}

					const serialized = serialize(sharedTree.saveSummary(), testSerializer, testHandle);
					const treeContent: SharedTreeSummaryBase = JSON.parse(serialized);
					const parsedTree = encoder.decodeSummary(treeContent);

					expect(parsedTree.currentTree).to.not.be.undefined;
					const testRoot = assertArrayOfOne(
						assertNotUndefined(parsedTree.currentTree?.traits[testTree.traitLabel])
					);
					expect(testRoot).to.not.be.undefined;
					expect(testRoot.traits.left).to.not.be.undefined;
					expect(testRoot.traits.right).to.not.be.undefined;
					expect(testRoot.traits.left.length).to.equal(2);

					const editLog: OrderedEditSet<ChangeInternal> = new EditLog(parsedTree.editHistory);

					// Expect there to be a change in the edit history in addition to the one from setUpTestSharedTree
					expect(editLog.length).to.equal(2);

					// The first operation to be sequenced is the tree init
					const treeInitEdit = await editLog.getEditAtIndex(1);
					expect(treeInitEdit.changes.length).to.equal(2);
					expect(treeInitEdit.changes[0].type).to.equal(ChangeType.Build);
					expect(treeInitEdit.changes[1].type).to.equal(ChangeType.Insert);
				});
			});

			it('can be used to initialize a tree', () => {
				const {
					sharedTree: sharedTree1,
					testTree: testTree1,
					containerRuntimeFactory,
				} = createSimpleTestTree({ localMode: false });
				const { tree: sharedTree2 } = setUpTestSharedTree();

				const newNode = testTree1.buildLeaf();

				sharedTree1.applyEdit(...Insert.create([newNode], StablePlace.before(testTree1.left)));
				containerRuntimeFactory.processAllMessages();

				sharedTree2.loadSummary(sharedTree1.saveSummary());

				// Trees should have equal state since we deserialized the first tree's state into the second tree
				expect(sharedTree1.equals(sharedTree2)).to.be.true;
			});

			it('can be used to initialize a tree with an empty edit list', () => {
				const { sharedTree: sharedTree1, containerRuntimeFactory } = createSimpleTestTree({ localMode: false });
				const { tree: sharedTree2 } = setUpTestSharedTree();

				containerRuntimeFactory.processAllMessages();

				// The second tree is not caught up to the first tree yet
				expect(sharedTree1.equals(sharedTree2)).to.be.false;

				sharedTree2.loadSummary(sharedTree1.saveSummary());

				// Trees should have equal state since we deserialized the first tree's state into the second tree
				expect(sharedTree1.equals(sharedTree2)).to.be.true;
			});

			it('asserts when loading a summary with duplicated edits', () => {
				const {
					sharedTree: sharedTree1,
					testTree: testTree1,
					containerRuntimeFactory,
				} = createSimpleTestTree({
					localMode: false,
					summarizeHistory: true,
					writeFormat: WriteFormat.v0_0_2,
				});
				const { sharedTree: sharedTree2 } = createSimpleTestTree();

				const newNode = testTree1.buildLeaf();

				sharedTree1.applyEdit(...Insert.create([newNode], StablePlace.before(testTree1.left)));
				containerRuntimeFactory.processAllMessages();
				const summary = sharedTree1.saveSummary() as SharedTreeSummary_0_0_2<Change>;
				const sequencedEdits = assertNotUndefined(summary.sequencedEdits).slice();
				sequencedEdits.push(sequencedEdits[0]);
				const corruptedSummary = {
					...summary,
					sequencedEdits,
				};
				expect(() => sharedTree2.loadSummary(corruptedSummary))
					.to.throw(Error)
					.that.has.property('message')
					.which.matches(/Duplicate/);
			});

			it('can be used without history preservation', async () => {
				const { sharedTree, testTree } = createSimpleTestTree({
					localMode: true,
					summarizeHistory: false,
				});

				const newNode = testTree.buildLeaf();
				const { id } = sharedTree.applyEdit(...Insert.create([newNode], StablePlace.before(testTree.left)));
				const view = sharedTree.currentView;
				const summary = sharedTree.saveSummary();

				sharedTree.loadSummary(summary);

				// The current state of the tree should be identical to the one contained in the old summary.
				expect(sharedTree.currentView.equals(view)).to.be.true;

				// The history should have been dropped by the default handling behavior.
				// It will contain a single entry setting the tree to equal the head revision.
				expect(sharedTree.edits.length).to.equal(1);
				expect(await sharedTree.edits.tryGetEdit(id)).to.be.undefined;
			});

			// TODO:#49901: Enable these tests once we write edit chunk handles to summaries
			it.skip('does not swallow errors in asynchronous blob uploading', async () => {
				const errorMessage = 'Simulated exception in uploadBlob';
				const { sharedTree, testTree, componentRuntime, containerRuntimeFactory } = createSimpleTestTree({
					localMode: false,
				});
				componentRuntime.uploadBlob = async () => {
					throw new Error(errorMessage);
				};

				let treeErrorEventWasInvoked = false;
				sharedTree.on('error', (error: unknown) => {
					treeErrorEventWasInvoked = true;
					expect(error).to.have.property('message').which.equals(errorMessage);
				});

				// Generate enough edits to cause a chunk upload.
				for (let i = 0; i < (sharedTree.edits as EditLog).editsPerChunk / 2 + 1; i++) {
					const insertee = testTree.buildLeaf(testTree.generateNodeId());
					sharedTree.applyEdit(...Insert.create([insertee], StablePlace.before(testTree.left)));
					sharedTree.applyEdit(Delete.create(StableRange.only(insertee)));
				}

				containerRuntimeFactory.processAllMessages();
				sharedTree.saveSummary();

				// Just waiting for the ChunksEmitted event here isn't sufficient, as the SharedTree error
				// will propagate in a separate promise chain.
				await new Promise((resolve) => setTimeout(resolve, 0));
				expect(treeErrorEventWasInvoked).to.equal(true, 'SharedTree error was never raised');
			});
		});

		describe('handles', () => {
			it('can reference a node', () => {
				// Test that a handle can wrap a node and retrieve that node's properties
				const { sharedTree, testTree } = createSimpleTestTree();
				const leftHandle = new TreeNodeHandle(sharedTree.currentView, testTree.left.identifier);
				expect(areNodesEquivalent(testTree.left, leftHandle)).to.be.true;
				expect(areNodesEquivalent(testTree.right, leftHandle)).to.be.false;
			});

			it('can create handles from children', () => {
				// Test that when retrieving children via the "traits" property of a handle, the
				// children are also wrapped in handles
				const { sharedTree, testTree } = createSimpleTestTree();
				const rootHandle = new TreeNodeHandle(sharedTree.currentView, testTree.identifier);
				expect(areNodesEquivalent(testTree, rootHandle)).to.be.true;
				const leftHandle = rootHandle.traits.left[0];
				expect(areNodesEquivalent(testTree.left, leftHandle)).to.be.true;
				expect(leftHandle instanceof TreeNodeHandle).to.be.true;
			});

			it('do not update when the current view of the tree changes', () => {
				const { sharedTree, testTree } = createSimpleTestTree();
				const leftHandle = new TreeNodeHandle(sharedTree.currentView, testTree.left.identifier);
				expect(leftHandle.traits.right).to.be.undefined;
				// Move "right" under "left"
				sharedTree.applyEdit(
					...Move.create(
						StableRange.only(testTree.right),
						StablePlace.atStartOf({ parent: testTree.left.identifier, label: testTree.right.traitLabel })
					)
				);
				expect(leftHandle.traits.right).to.be.undefined;
			});
		});

		describe('telemetry', () => {
			describe('useFailedSequencedEditTelemetry', () => {
				it('decorates events with the correct properties', async () => {
					// Test that a handle can wrap a node and retrieve that node's properties
					const events: ITelemetryBaseEvent[] = [];
					const { sharedTree, testTree, containerRuntimeFactory } = createSimpleTestTree({
						logger: { send: (event) => events.push(event) },
						allowInvalid: true,
					});
					useFailedSequencedEditTelemetry(sharedTree);

					// Invalid edit
					sharedTree.applyEdit(
						...Insert.create(
							[testTree.buildLeaf()],
							StablePlace.after(testTree.buildLeaf(testTree.generateNodeId()))
						)
					);
					containerRuntimeFactory.processAllMessages();
					// Force demand, which will cause a telemetry event for the invalid edit to be emitted
					await sharedTree.logViewer.getRevisionView(Number.POSITIVE_INFINITY);
					expect(events.length).is.greaterThan(0);
					events.forEach((event) => {
						expect(isSharedTreeEvent(event)).is.true;
					});
				});

				it('is logged for invalid locally generated edits when those edits are sequenced', async () => {
					const events: ITelemetryBaseEvent[] = [];
					const { sharedTree, testTree, containerRuntimeFactory } = createSimpleTestTree({
						logger: { send: (event) => events.push(event) },
						allowInvalid: true,
					});
					useFailedSequencedEditTelemetry(sharedTree);

					// Invalid edit
					sharedTree.applyEdit(
						...Insert.create(
							[testTree.buildLeaf()],
							StablePlace.after(testTree.buildLeaf(testTree.generateNodeId()))
						)
					);
					expect(events.length).equals(0);
					containerRuntimeFactory.processAllMessages();
					// Force demand, which will cause a telemetry event for the invalid edit to be emitted
					await sharedTree.logViewer.getRevisionView(Number.POSITIVE_INFINITY);
					expect(events.length).equals(1);
					expect(events[0].category).equals('generic');
					expect(events[0].eventName).equals('SharedTree:SequencedEditApplied:InvalidSharedTreeEdit');
				});

				it('can be disabled and re-enabled', async () => {
					const events: ITelemetryBaseEvent[] = [];
					const { sharedTree, testTree, containerRuntimeFactory } = createSimpleTestTree({
						logger: { send: (event) => events.push(event) },
						allowInvalid: true,
					});
					const { disable } = useFailedSequencedEditTelemetry(sharedTree);

					sharedTree.applyEdit(
						...Insert.create(
							[testTree.buildLeaf()],
							StablePlace.after(testTree.buildLeaf(testTree.generateNodeId()))
						)
					);
					expect(events.length).equals(0);
					containerRuntimeFactory.processAllMessages();
					await sharedTree.logViewer.getRevisionView(Number.POSITIVE_INFINITY);
					expect(events.length).equals(1);
					expect(events[0].eventName).equals('SharedTree:SequencedEditApplied:InvalidSharedTreeEdit');

					disable();

					sharedTree.applyEdit(
						...Insert.create(
							[testTree.buildLeaf()],
							StablePlace.after(testTree.buildLeaf(testTree.generateNodeId()))
						)
					);
					containerRuntimeFactory.processAllMessages();
					await sharedTree.logViewer.getRevisionView(Number.POSITIVE_INFINITY);
					expect(events.length).equals(1);

					useFailedSequencedEditTelemetry(sharedTree);

					sharedTree.applyEdit(
						...Insert.create(
							[testTree.buildLeaf()],
							StablePlace.after(testTree.buildLeaf(testTree.generateNodeId()))
						)
					);
					containerRuntimeFactory.processAllMessages();
					await sharedTree.logViewer.getRevisionView(Number.POSITIVE_INFINITY);
					expect(events.length).equals(2);
					expect(events[1].eventName).equals('SharedTree:SequencedEditApplied:InvalidSharedTreeEdit');
				});

				it('is not logged for valid edits', async () => {
					const events: ITelemetryBaseEvent[] = [];
					const { sharedTree, testTree, containerRuntimeFactory } = createSimpleTestTree({
						logger: { send: (event) => events.push(event) },
					});
					useFailedSequencedEditTelemetry(sharedTree);

					sharedTree.applyEdit(...Insert.create([testTree.buildLeaf()], StablePlace.after(testTree.left)));
					containerRuntimeFactory.processAllMessages();
					await sharedTree.logViewer.getRevisionView(Number.POSITIVE_INFINITY);
					expect(events.length).equals(0);
				});

				it('is not logged for remote edits', async () => {
					const events: ITelemetryBaseEvent[] = [];
					const { sharedTree: sharedTree1, containerRuntimeFactory } = createSimpleTestTree({
						logger: { send: (event) => events.push(event) },
						allowInvalid: true,
						localMode: false,
					});
					const { sharedTree: sharedTree2, testTree: testTree2 } = createSimpleTestTree({
						containerRuntimeFactory,
						id: 'secondTestSharedTree',
						localMode: false,
					});
					useFailedSequencedEditTelemetry(sharedTree1);

					sharedTree2.applyEdit(
						...Insert.create(
							[testTree2.buildLeaf()],
							StablePlace.after(testTree2.buildLeaf(testTree2.generateNodeId()))
						)
					);
					containerRuntimeFactory.processAllMessages();
					await sharedTree1.logViewer.getRevisionView(Number.POSITIVE_INFINITY);
					expect(events.length).equals(0);
				});
			});
		});

		describe('Events', () => {
			it('fires an event when an edit is committed', () => {
				const { sharedTree, testTree } = createSimpleTestTree();

				let eventCount = 0;
				let editIdFromEvent: EditId | undefined;
				sharedTree.on(SharedTreeEvent.EditCommitted, (args: EditCommittedEventArguments) => {
					expect(args.local).true;
					expect(args.tree).equals(sharedTree);
					editIdFromEvent = args.editId;
					eventCount += 1;
				});

				// Invalid change
				const invalidEdit = sharedTree.applyEdit(
					...Insert.create(
						[testTree.buildLeaf()],
						StablePlace.after(testTree.buildLeaf(testTree.generateNodeId()))
					)
				);
				expect(editIdFromEvent).equals(invalidEdit.id);
				expect(eventCount).equals(1);

				// Valid change
				const { id } = sharedTree.applyEdit(
					...Insert.create([testTree.buildLeaf()], StablePlace.after(testTree.left))
				);
				expect(editIdFromEvent).equals(id);
				expect(eventCount).equals(2);
			});

			it('fires an event when a sequenced edit is applied', async () => {
				const {
					sharedTree: sharedTree1,
					testTree,
					containerRuntimeFactory,
				} = createSimpleTestTree({
					allowInvalid: true,
					localMode: false,
				});
				const { tree: sharedTree2 } = setUpTestSharedTree({
					containerRuntimeFactory,
					id: 'secondTestSharedTree',
					localMode: false,
				});

				containerRuntimeFactory.processAllMessages();
				await sharedTree1.logViewer.getRevisionView(Number.POSITIVE_INFINITY);

				const eventArgs: SequencedEditAppliedEventArguments[] = [];
				sharedTree1.on(SharedTreeEvent.SequencedEditApplied, (args: SequencedEditAppliedEventArguments) =>
					eventArgs.push(args)
				);

				// Invalid change
				const change = Change.setPayload(testTree.generateNodeId(), 42);
				const invalidEdit = sharedTree1.applyEdit(change);
				containerRuntimeFactory.processAllMessages();
				await sharedTree1.logViewer.getRevisionView(Number.POSITIVE_INFINITY);

				expect(eventArgs.length).equals(1);
				expect(eventArgs[0].edit.id).equals(invalidEdit.id);
				expect(eventArgs[0].wasLocal).equals(true);
				expect(eventArgs[0].reconciliationPath.length).equals(0);
				expect(eventArgs[0].outcome.status).equals(EditStatus.Invalid);

				// Valid change
				const validEdit1 = sharedTree2.applyEdit(
					...Insert.create([testTree.buildLeaf()], StablePlace.after(testTree.left))
				);

				// Valid change
				const validEdit2 = sharedTree1.applyEdit(
					...Insert.create([testTree.buildLeaf()], StablePlace.after(testTree.left))
				);
				containerRuntimeFactory.processAllMessages();
				await sharedTree1.logViewer.getRevisionView(Number.POSITIVE_INFINITY);

				expect(eventArgs.length).equals(3);
				expect(eventArgs[1].edit.id).equals(validEdit1.id);
				expect(eventArgs[1].wasLocal).equals(false);
				expect(eventArgs[1].reconciliationPath.length).equals(0);
				expect(eventArgs[1].outcome.status).equals(EditStatus.Applied);

				expect(eventArgs[2].edit.id).equals(validEdit2.id);
				expect(eventArgs[2].wasLocal).equals(true);
				expect(eventArgs[2].reconciliationPath.length).equals(1);
				expect(eventArgs[2].outcome.status).equals(EditStatus.Applied);
			});
		});

		// This functionality was only implemented in format 0.1.1.
		if (writeFormat !== WriteFormat.v0_0_2) {
			describe('String interning and tree compression', () => {
				it('compress ops via interning and tree compression and decompress when processing edits', () => {
					const {
						sharedTree: tree,
						testTree,
						containerRuntimeFactory,
					} = createSimpleTestTree({ writeFormat });
					const { tree: secondTree } = setUpTestSharedTree({ containerRuntimeFactory, writeFormat });
					const remoteRuntime = containerRuntimeFactory.createContainerRuntime(
						new MockFluidDataStoreRuntime()
					);

					const newNode = testTree.buildLeaf(testTree.generateNodeId());
					const insert = Insert.create([newNode], StablePlace.after(testTree.left));
					const move = Move.create(StableRange.only(newNode), StablePlace.before(testTree.left));

					tree.applyEdit(...insert);
					tree.applyEdit(...move);

					// Unit testing the interning of ops requires access violation since factory and messages are protected.
					type WithFactory<T> = T & { factory: MockContainerRuntimeFactory };
					type WithMessages<T> = T & { messages: ISequencedDocumentMessage[] };
					const factory = (remoteRuntime as unknown as WithFactory<MockContainerRuntime>).factory;
					const messages = (factory as unknown as WithMessages<MockContainerRuntimeFactory>).messages;

					for (const message of messages) {
						expect(message.contents.internedStrings).to.not.be.undefined;
					}
					expect(tree.equals(secondTree)).to.be.false;

					containerRuntimeFactory.processAllMessages();

					const insertEdit = secondTree.edits.getEditInSessionAtIndex(1);
					const moveEdit = secondTree.edits.getEditInSessionAtIndex(2);
					expect(insertEdit.changes).to.deep.equal(insert);
					expect(moveEdit.changes).to.deep.equal(move);
					expect(tree.equals(secondTree)).to.be.true;
				});

				it('compress summaries via interning and tree compression on save and decompress on load', () => {
					const {
						sharedTree: tree,
						testTree: testTree,
						containerRuntimeFactory,
					} = createSimpleTestTree({ writeFormat });
					const { sharedTree: secondTree } = createSimpleTestTree({ writeFormat });

					const newNode = testTree.buildLeaf(testTree.generateNodeId());
					tree.applyEdit(...Insert.create([newNode], StablePlace.after(testTree.left)));
					tree.applyEdit(...Move.create(StableRange.only(newNode), StablePlace.before(testTree.left)));

					containerRuntimeFactory.processAllMessages();

					const summary = tree.saveSummary() as SharedTreeSummary<Change>;
					const interner = new StringInterner();
					const treeCompressor = new TreeCompressor_0_1_1();
					const expectedCompressedTree = treeCompressor.compress(
						getChangeNodeFromView(tree.currentView),
						interner
					);
					expect(summary.internedStrings).to.not.be.undefined;
					expect(summary.internedStrings).deep.equal(interner.getSerializable());
					expect(summary.currentTree).deep.equal(expectedCompressedTree);

					expect(tree.equals(secondTree)).to.be.false;
					secondTree.loadSummary(summary);
					expect(tree.equals(secondTree)).to.be.true;
				});
			});
		}
	});
}
