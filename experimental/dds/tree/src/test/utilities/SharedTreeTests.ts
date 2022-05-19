/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, expect } from 'chai';
import { ITelemetryBaseEvent } from '@fluidframework/common-definitions';
import { IsoBuffer } from '@fluidframework/common-utils';
import { LoaderHeader } from '@fluidframework/container-definitions';
import { ISequencedDocumentMessage } from '@fluidframework/protocol-definitions';
import {
	MockContainerRuntime,
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
} from '@fluidframework/test-runtime-utils';
import { assertArrayOfOne, assertNotUndefined, fail, isSharedTreeEvent } from '../../Common';
import { EditId, NodeId, OpSpaceNodeId, TraitLabel } from '../../Identifiers';
import { CachingLogViewer } from '../../LogViewer';
import { EditLog, OrderedEditSet } from '../../EditLog';
import { initialTree } from '../../InitialTree';
import { TreeNodeHandle } from '../../TreeNodeHandle';
import { deserialize } from '../../SummaryBackCompatibility';
import { useFailedSequencedEditTelemetry } from '../../MergeHealth';
import { MutableStringInterner } from '../../StringInterner';
import { getChangeNodeFromView } from '../../SerializationUtilities';
import { EditCommittedEventArguments, SequencedEditAppliedEventArguments, SharedTree } from '../../SharedTree';
import {
	ChangeInternal,
	ChangeNode,
	ChangeNode_0_0_2,
	ChangeTypeInternal,
	CompressedChangeInternal,
	EditChunkContents,
	editsPerChunk,
	EditStatus,
	EditWithoutId,
	FluidEditHandle,
	SharedTreeEditOp,
	SharedTreeSummary,
	SharedTreeSummaryBase,
	SharedTreeSummary_0_0_2,
	WriteFormat,
} from '../../persisted-types';
import { SharedTreeDiagnosticEvent, SharedTreeEvent } from '../../EventTypes';
import { BuildNode, Change, ChangeType, StablePlace, StableRange } from '../../ChangeTypes';
import { convertTreeNodes, deepCompareNodes } from '../../EditUtilities';
import { serialize, SummaryContents } from '../../Summary';
import { InterningTreeCompressor } from '../../TreeCompressor';
import { SharedTreeEncoder_0_0_2, SharedTreeEncoder_0_1_1 } from '../../SharedTreeEncoder';
import { sequencedIdNormalizer } from '../../NodeIdUtilities';
import { convertNodeDataIds } from '../../IdConversion';
import { generateStableId, nilUuid } from '../../UuidUtilities';
import { buildLeaf, SimpleTestTree, TestTree } from './TestNode';
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
	spyOnSubmittedOps,
	normalizeIds,
	normalizeId,
	normalizeEdit,
	setUpLocalServerTestSharedTree,
	applyNoop,
	getIdNormalizerFromSharedTree,
	waitForSummary,
	getEditLogInternal,
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
					...Change.move(StableRange.only(testTree.left), StablePlace.after(testTree.right))
				);
				expect(changeCount).equals(1);
			});

			it('can insert a wrapped tree', () => {
				const { sharedTree, testTree } = createSimpleTestTree();

				const childNode = testTree.buildLeaf(testTree.generateNodeId());
				const childId = 0;
				const childrenTraitLabel = 'children' as TraitLabel;
				const parentNode = {
					identifier: testTree.generateNodeId(),
					definition: 'node',
					traits: {
						[childrenTraitLabel]: childId,
					},
				};
				const parentId = 1;
				const buildChild = Change.build(childNode, childId);
				const buildParent = Change.build(parentNode, parentId);
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
				const childId = 0;
				const childrenTraitLabel = 'children';
				const parentNode: BuildNode = {
					identifier: testTree.generateNodeId(),
					definition: 'node',
					traits: {
						[childrenTraitLabel]: childId,
					},
				};
				const parentNode2: BuildNode = {
					identifier: testTree.generateNodeId(),
					definition: 'node',
					traits: {
						[childrenTraitLabel]: childId,
					},
				};

				const buildChild = Change.build(childNode, childId);
				const buildParent = Change.build(parentNode, 1);
				const buildParent2 = Change.build(parentNode2, 2);

				assertNoDelta(sharedTree, () => {
					// we don't expect this edit application to change anything
					sharedTree.applyEdit(buildChild, buildParent, buildParent2);
				});
			});

			// TODO:#58052: Make this test pass.
			it.skip('prevents setting the value of a node in a detached subtree', () => {
				const { sharedTree, testTree } = createSimpleTestTree({ allowInvalid: true });

				const detachedNode = testTree.buildLeaf(testTree.generateNodeId());
				const detachedSequenceId = 0;
				const { id } = sharedTree.applyEdit(
					Change.build(detachedNode, detachedSequenceId),
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
				const detachedNewNodeSequenceId = 0;
				const detachedRightNodeSequenceId = 1;
				const { id } = sharedTree.applyEdit(
					Change.build(detachedNewNode, detachedNewNodeSequenceId),
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
					sharedTree.applyEdit(Change.delete(StableRange.only(rootId)));
				});
			});

			it('can apply multiple local edits without ack from server', () => {
				const { sharedTree, testTree } = createSimpleTestTree();

				const newNode = testTree.buildLeaf(testTree.generateNodeId());

				sharedTree.applyEdit(...Change.insertTree(newNode, StablePlace.after(testTree.left)));
				sharedTree.applyEdit(...Change.move(StableRange.only(newNode), StablePlace.before(testTree.left)));

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

				sharedTree.applyEdit(...Change.insertTree(firstNode, StablePlace.after(testTree.left)));
				sharedTree.applyEdit(Change.delete(StableRange.only(firstNode)));

				// Trying to insert next to the deleted node should drop, confirm that it doesn't
				// change the view
				assertNoDelta(sharedTree, () => {
					sharedTree.applyEdit(...Change.insertTree(secondNode, StablePlace.after(firstNode)));
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
					...Change.insertTree([firstNode, secondNode, thirdNode], StablePlace.after(testTree.left))
				);
				sharedTree.applyEdit(Change.delete(StableRange.only(secondNode)));

				assertNoDelta(sharedTree, () => {
					// Trying to delete from before firstNode to after secondNode should drop
					sharedTree.applyEdit(
						Change.delete(StableRange.from(StablePlace.before(firstNode)).to(StablePlace.after(secondNode)))
					);

					// Trying to delete from after thirdNode to before firstNode should drop
					sharedTree.applyEdit(
						Change.delete(StableRange.from(StablePlace.after(thirdNode)).to(StablePlace.before(firstNode)))
					);
				});

				// Expect that firstNode did not get deleted
				const leftTrait = sharedTree.currentView.getTrait(testTree.left.traitLocation);
				expect(leftTrait.length).to.equal(3);
			});

			it('tolerates malformed inserts', () => {
				const { sharedTree } = createSimpleTestTree({ allowMalformed: true });

				assertNoDelta(sharedTree, () => {
					sharedTree.applyEdit(Change.build([], 0));
				});
			});

			it('correctly reports attribution ID', () => {
				const attributionId = generateStableId();
				const { tree } = setUpTestSharedTree({ attributionId });
				expect(tree.attributionId).to.equal(writeFormat === WriteFormat.v0_0_2 ? nilUuid : attributionId);
			});

			it('correctly attributes node IDs', () => {
				const attributionId = generateStableId();
				const { tree } = setUpTestSharedTree({ attributionId });
				const id = tree.generateNodeId();
				expect(tree.attributeNodeId(id)).to.equal(writeFormat === WriteFormat.v0_0_2 ? nilUuid : attributionId);
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
					...Change.insertTree(
						[buildLeaf(newNodeId1)],
						StablePlace.atStartOf(testTrait(sharedTree1.currentView))
					)
				);

				// Sync initial tree
				containerRuntimeFactory.processAllMessages();

				const newNodeId2 = translateId(newNodeId1, sharedTree1, sharedTree2);

				// Both trees should contain 'left'
				expect(sharedTree1.currentView.getViewNode(newNodeId1)).to.not.be.undefined;
				expect(sharedTree2.currentView.getViewNode(newNodeId2)).to.not.be.undefined;

				sharedTree2.applyEdit(Change.delete(StableRange.only(newNodeId2)));

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
					...Change.insertTree(
						[buildLeaf(newNodeId1)],
						StablePlace.atStartOf(testTrait(sharedTree1.currentView))
					)
				);
				containerRuntimeFactory.processAllMessages();

				// First client deletes a trait containing a node in the initial tree
				sharedTree1.applyEdit(Change.delete(StableRange.all(testTrait(sharedTree1.currentView))));

				// Second client concurrently adds a new node to that trait
				const newNodeId2 = sharedTree2.generateNodeId();
				sharedTree2.applyEdit(
					...Change.insertTree(
						[buildLeaf(newNodeId2)],
						StablePlace.atStartOf(testTrait(sharedTree2.currentView))
					)
				);

				containerRuntimeFactory.processAllMessages();

				// Second client's change gets sequenced after the deletion, so the trait
				// should exist and contain the second new node on both clients after messages are delivered.
				const leftTrait = normalizeIds(
					sharedTree1,
					...sharedTree1.currentView.getTrait(testTrait(sharedTree1.currentView))
				);
				const secondLeftTrait = normalizeIds(
					sharedTree2,
					...sharedTree2.currentView.getTrait(testTrait(sharedTree2.currentView))
				);
				expect(leftTrait.length).equals(1);
				expect(leftTrait[0]).equals(normalizeId(sharedTree2, newNodeId2));
				expect(leftTrait).deep.equals(secondLeftTrait);
			});

			it('is equal to a tree with the same state', () => {
				const { tree: sharedTree1, containerRuntimeFactory } = setUpTestSharedTree(tree1Options);
				const { tree: sharedTree2 } = setUpTestSharedTree(createSecondTreeOptions(containerRuntimeFactory));
				const newNodeId1 = sharedTree1.generateNodeId();
				sharedTree1.applyEdit(
					...Change.insertTree(
						[
							{
								identifier: newNodeId1,
								definition: 'foo',
								traits: { left: buildLeaf(), right: buildLeaf() },
							},
						],
						StablePlace.atStartOf(testTrait(sharedTree1.currentView))
					)
				);
				containerRuntimeFactory.processAllMessages();
				expect(sharedTree1.equals(sharedTree2)).to.be.true;
				sharedTree2.applyEdit(
					Change.delete(StableRange.only(translateId(newNodeId1, sharedTree1, sharedTree2)))
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
								traits: { child: childNode },
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
					...Change.move(StableRange.only(childId), StablePlace.atStartOf(childTraitUnderParent2))
				);

				// Concurrently move parent2 under child
				// This first edit should succeed locally but fail globally
				const edit2 = sharedTree2.applyEdit(
					...Change.move(StableRange.only(parent2Id), StablePlace.atStartOf(badTraitUnderChild))
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
					...Change.insertTree(firstNode2, StablePlace.atStartOf(testTrait(sharedTree2.currentView)))
				);
				containerRuntimeFactory.processAllMessages();

				// Concurrently edit, creating invalid insert.
				// Create delete. This will apply.
				const secondEdit = sharedTree1.applyEdit(
					Change.delete(StableRange.only(translateId(firstNode2, sharedTree2, sharedTree1)))
				);

				let thirdEdit;
				assertNoDelta(sharedTree1, () => {
					// concurrently insert next to the deleted node: this will become invalid.
					const secondNode2 = buildLeaf();
					thirdEdit = sharedTree2.applyEdit(...Change.insertTree(secondNode2, StablePlace.after(firstNode2)));
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
					...Change.insertTree(
						[firstNode2, secondNode2, thirdNode],
						StablePlace.atStartOf(testTrait(sharedTree2.currentView))
					)
				);
				containerRuntimeFactory.processAllMessages();

				// Create delete. This will apply.
				const secondEdit = sharedTree1.applyEdit(
					Change.delete(StableRange.only(translateId(secondNode2, sharedTree2, sharedTree1)))
				);

				// concurrently delete from before firstNode to after secondNode: this should become invalid
				const thirdEdit = sharedTree2.applyEdit(
					Change.delete(StableRange.from(StablePlace.before(firstNode2)).to(StablePlace.after(secondNode2)))
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
					const build = Change.build([], 0);
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
				const ops = spyOnSubmittedOps(containerRuntimeFactory);
				const initialEditCount = sharedTree1.edits.length;
				sharedTree1.applyEdit(Change.setPayload(sharedTree1.currentView.root, 42));
				remoteRuntime.submit(ops[0], /* localOpMetadata */ undefined);
				containerRuntimeFactory.processAllMessages();
				expect(sharedTree1.edits.length).to.equal(initialEditCount + 1);
			});

			it('detects concurrent duplicate IDs', () => {
				const { tree: sharedTree1, containerRuntimeFactory } = setUpTestSharedTree({
					...tree1Options,
					allowInvalid: true,
				});
				const { tree: sharedTree2 } = setUpTestSharedTree({
					...createSecondTreeOptions(containerRuntimeFactory),
					allowInvalid: true,
				});
				containerRuntimeFactory.processAllMessages();

				const duplicateId = 'duplicate';
				sharedTree1.applyEdit(
					...Change.insertTree(
						[buildLeaf(sharedTree1.generateNodeId(duplicateId))],
						StablePlace.atEndOf(testTrait(sharedTree1.currentView))
					)
				);
				sharedTree2.applyEdit(
					...Change.insertTree(
						[buildLeaf(sharedTree2.generateNodeId(duplicateId))],
						StablePlace.atEndOf(testTrait(sharedTree2.currentView))
					)
				);

				containerRuntimeFactory.processAllMessages();
				expect(sharedTree1.currentView.size).to.equal(2);
				const trait1 = sharedTree1.currentView.getTrait(testTrait(sharedTree1.currentView));
				expect(trait1.length).to.equal(1);
				expect(sharedTree1.convertToStableNodeId(trait1[0])).to.equal(duplicateId);
				expect(sharedTree1.equals(sharedTree2));
			});

			if (writeFormat !== WriteFormat.v0_0_2) {
				// This is a regression test for an issue where edits containing Fluid handles weren't properly
				// serialized by chunk uploading code: rather than use an IFluidSerializer, we previously just
				// JSON.stringify'd.
				it('can round-trip edits containing handles through chunking', async () => {
					const blobbedPayload = 'blobbed-string-payload';
					const { tree, testObjectProvider } = await setUpLocalServerTestSharedTree({
						writeFormat,
					});
					const testTree = setUpTestTree(tree);

					const buffer = IsoBuffer.from(blobbedPayload, 'utf8');
					const blob = await tree.getRuntime().uploadBlob(buffer);
					const nodeWithPayload = testTree.buildLeaf(testTree.generateNodeId());
					tree.applyEdit(
						...Change.insertTree(nodeWithPayload, StablePlace.after(testTree.left)),
						Change.setPayload(nodeWithPayload.identifier, { blob })
					);

					// Apply enough edits for the upload of an edit chunk
					for (let i = 0; i < (tree.edits as EditLog).editsPerChunk; i++) {
						applyNoop(tree);
					}

					// `ensureSynchronized` does not guarantee blob upload
					await new Promise((resolve) => setImmediate(resolve));
					// Wait for the ops to to be submitted and processed across the containers
					await testObjectProvider.ensureSynchronized();

					const summary = tree.saveSummary() as SharedTreeSummary;

					const { editHistory } = summary;
					const { editChunks } = assertNotUndefined(editHistory);
					expect(editChunks.length).to.equal(2);

					const chunkHandle = editChunks[0].chunk as FluidEditHandle;
					expect(typeof chunkHandle.get).to.equal('function');

					const { tree: secondTree } = await setUpLocalServerTestSharedTree({
						writeFormat,
						testObjectProvider,
					});
					secondTree.loadSummary(summary);
					expect(tree.equals(secondTree)).to.be.true;

					const { blob: blobHandle } = new TreeNodeHandle(
						secondTree.currentView,
						translateId(nodeWithPayload.identifier, tree, secondTree)
					).payload;
					expect(blobHandle).to.not.be.undefined;
					const blobContents = await blobHandle.get();
					expect(IsoBuffer.from(blobContents, 'utf8').toString()).to.equal(blobbedPayload);
				});

				it('can exchange attribution IDs', () => {
					const attributionId1 = generateStableId();
					const { tree: sharedTree1, containerRuntimeFactory } = setUpTestSharedTree({
						...tree1Options,
						attributionId: attributionId1,
					});
					const attributionId2 = generateStableId();
					const { tree: sharedTree2 } = setUpTestSharedTree({
						...createSecondTreeOptions(containerRuntimeFactory),
						attributionId: attributionId2,
					});
					containerRuntimeFactory.processAllMessages();

					const nodeId1 = sharedTree1.generateNodeId();
					const stableNodeId1 = sharedTree1.convertToStableNodeId(nodeId1);
					sharedTree1.applyEdit(
						...Change.insertTree(
							[buildLeaf(nodeId1)],
							StablePlace.atEndOf(testTrait(sharedTree1.currentView))
						)
					);

					containerRuntimeFactory.processAllMessages();
					expect(sharedTree2.attributeNodeId(sharedTree2.convertToNodeId(stableNodeId1))).to.equal(
						attributionId1
					);

					const nodeId2 = sharedTree2.generateNodeId();
					const stableNodeId2 = sharedTree2.convertToStableNodeId(nodeId1);
					sharedTree2.applyEdit(
						...Change.insertTree(
							[buildLeaf(nodeId2)],
							StablePlace.atEndOf(testTrait(sharedTree2.currentView))
						)
					);

					containerRuntimeFactory.processAllMessages();
					expect(sharedTree1.attributeNodeId(sharedTree1.convertToNodeId(stableNodeId2))).to.equal(
						attributionId2
					);
				});
			}
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
					const summary = parsedTree as SharedTreeSummary_0_0_2;
					expect(summary.sequencedEdits).to.deep.equal([]);
					expect(deepCompareNodes(summary.currentTree, initialTree)).to.be.true;
				} else {
					const summary = parsedTree as SharedTreeSummary;
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
					sharedTree.applyEdit(...Change.insertTree(newNode, StablePlace.before(testTree.left)));
					if (!hasLocalEdits) {
						containerRuntimeFactory.processAllMessages();
					}

					const serialized = serialize(sharedTree.saveSummary(), testSerializer, testHandle);
					const treeContent: SharedTreeSummaryBase = JSON.parse(serialized);
					let parsedTree: SummaryContents;
					if (writeFormat === WriteFormat.v0_1_1) {
						parsedTree = new SharedTreeEncoder_0_1_1(true).decodeSummary(
							treeContent as SharedTreeSummary,
							sharedTree.attributionId
						);
					} else {
						parsedTree = new SharedTreeEncoder_0_0_2(true).decodeSummary(
							treeContent as SharedTreeSummary_0_0_2
						);
					}

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

				sharedTree1.applyEdit(...Change.insertTree(newNode, StablePlace.before(testTree1.left)));
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
				const { tree: sharedTree2 } = setUpTestSharedTree();

				const newNode = testTree1.buildLeaf();

				sharedTree1.applyEdit(...Change.insertTree(newNode, StablePlace.before(testTree1.left)));
				containerRuntimeFactory.processAllMessages();
				const summary = sharedTree1.saveSummary() as SharedTreeSummary_0_0_2;
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
				const { id } = sharedTree.applyEdit(...Change.insertTree(newNode, StablePlace.before(testTree.left)));
				const treeBefore = convertTreeNodes<ChangeNode, ChangeNode_0_0_2>(
					getChangeNodeFromView(sharedTree.currentView),
					(node) => convertNodeDataIds(node, (id) => sharedTree.convertToStableNodeId(id))
				);
				const summary = sharedTree.saveSummary();

				const { tree: sharedTree2 } = setUpTestSharedTree();

				sharedTree2.loadSummary(summary);
				const treeAfter = convertTreeNodes<ChangeNode, ChangeNode_0_0_2>(
					getChangeNodeFromView(sharedTree2.currentView),
					(node) => convertNodeDataIds(node, (id) => sharedTree2.convertToStableNodeId(id))
				);
				// The current state of the tree should be identical to the one contained in the old summary.
				expect(deepCompareNodes(treeBefore, treeAfter)).to.be.true;

				// The history should have been dropped by the default handling behavior.
				// It will contain a single entry setting the tree to equal the head revision.
				expect(sharedTree2.edits.length).to.equal(1);
				expect(await sharedTree2.edits.tryGetEdit(id)).to.be.undefined;
			});

			it('correctly handles payloads at the root', () => {
				const payload = 'foo';
				const { tree, containerRuntimeFactory } = setUpTestSharedTree({ summarizeHistory: false });
				tree.applyEdit(Change.setPayload(tree.currentView.root, payload));
				containerRuntimeFactory.processAllMessages();
				const summary = tree.saveSummary();
				const { tree: tree2 } = setUpTestSharedTree({ summarizeHistory: false });
				tree2.loadSummary(summary);
				expect(tree2.currentView.tryGetViewNode(tree2.currentView.root)?.payload).to.equal(payload);
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
					sharedTree.applyEdit(...Change.insertTree(insertee, StablePlace.before(testTree.left)));
					sharedTree.applyEdit(Change.delete(StableRange.only(insertee)));
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
					...Change.move(
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
						...Change.insertTree(
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
						...Change.insertTree(
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
						...Change.insertTree(
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
						...Change.insertTree(
							[testTree.buildLeaf()],
							StablePlace.after(testTree.buildLeaf(testTree.generateNodeId()))
						)
					);
					containerRuntimeFactory.processAllMessages();
					await sharedTree.logViewer.getRevisionView(Number.POSITIVE_INFINITY);
					expect(events.length).equals(1);

					useFailedSequencedEditTelemetry(sharedTree);

					sharedTree.applyEdit(
						...Change.insertTree(
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

					sharedTree.applyEdit(...Change.insertTree(testTree.buildLeaf(), StablePlace.after(testTree.left)));
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
						...Change.insertTree(
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
					...Change.insertTree(
						[testTree.buildLeaf()],
						StablePlace.after(testTree.buildLeaf(testTree.generateNodeId()))
					)
				);
				expect(editIdFromEvent).equals(invalidEdit.id);
				expect(eventCount).equals(1);

				// Valid change
				const { id } = sharedTree.applyEdit(
					...Change.insertTree(testTree.buildLeaf(), StablePlace.after(testTree.left))
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
					...Change.insertTree(
						[testTree.buildLeaf()],
						StablePlace.after(testTree.left.translateId(sharedTree2))
					)
				);

				// Valid change
				const validEdit2 = sharedTree1.applyEdit(
					...Change.insertTree(testTree.buildLeaf(), StablePlace.after(testTree.left))
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

		/**
		 * This test is a slightly minified regression test for an issue discovered by fuzz testing.
		 * It demonstrates issues with clients using writeFormat v0.1.1 and mixed `summarizeHistory` values.
		 * The problem is illustrated by the following scenario:
		 * 1. Client A and client B join a session. A does not summarize history, but B does.
		 * 2. A is elected to be the summarizer.
		 * 3. Client A and B make 50 edits (half a chunks' worth), then idle.
		 * 4. Client A summarizes. Since it does not summarize history, the summary it produces has a single edit.
		 * 5. Client C joins, configured to write history.
		 * 6. The three clients collaborate further for another 50/51 edits.
		 *
		 * At this point in time, client B thinks the first edit chunk is full, but client C thinks it's only half-full.
		 * The entire edit compression scheme is built upon assuming clients agree where the chunk boundaries are, so this
		 * generally leads to correctness issues. The fuzz test reproed a similar scenario, and what ultimately caused
		 * failure is a newly-loaded client being shocked at a chunk with `startRevision: 400` uploaded (when it thinks
		 * there has only been one edit).
		 *
		 * To fix this, we need to incorporate a scheme where all clients agree on chunk boundaries (e.g., by including the
		 * total number of edits even in no-history summaries).
		 *
		 * In the meantime, we are forbidding collaboration of no-history clients and history clients.
		 */
		it('can be initialized on multiple clients with different `summarizeHistory` values', async () => {
			const { tree, testObjectProvider, container } = await setUpLocalServerTestSharedTree({
				writeFormat,
				summarizeHistory: false,
			});

			applyNoop(tree);
			await testObjectProvider.ensureSynchronized();
			const firstSummaryVersion = await waitForSummary(container);

			const { tree: tree2 } = await setUpLocalServerTestSharedTree({
				writeFormat,
				testObjectProvider,
				summarizeHistory: true,
				headers: { [LoaderHeader.version]: firstSummaryVersion },
			});

			// Apply enough edits for the upload of a few edit chunks, and some extra so future chunks are misaligned
			for (let i = 0; i < (5 * editsPerChunk) / 2; i++) {
				applyNoop(tree);
			}

			const secondSummaryVersion = await waitForSummary(container);

			const { tree: tree3 } = await setUpLocalServerTestSharedTree({
				writeFormat,
				testObjectProvider,
				summarizeHistory: true,
				headers: { [LoaderHeader.version]: secondSummaryVersion },
			});

			// Verify we loaded a no-history summary.
			expect(tree3.edits.length).to.equal(1);

			let unexpectedHistoryChunkCount = 0;
			tree3.on(SharedTreeDiagnosticEvent.UnexpectedHistoryChunk, () => unexpectedHistoryChunkCount++);
			await testObjectProvider.ensureSynchronized();
			// Apply enough edits to guarantee another chunk upload occurs.
			for (let i = 0; i < editsPerChunk; i++) {
				applyNoop(tree2);
			}

			await testObjectProvider.ensureSynchronized();
			// If tree 2 didn't change its write format, it would attempt to upload the above chunk with start revision 200, which is past
			// how many sequenced edits tree 3 thinks there are.
			expect(unexpectedHistoryChunkCount).to.equal(0);
		}).timeout(/* double summarization can take some time */ 20000);

		// This functionality was only implemented in format 0.1.1.
		if (writeFormat !== WriteFormat.v0_0_2) {
			describe('String interning and tree compression', () => {
				function getMutableStringInterner(tree: SharedTree): MutableStringInterner {
					const summary = tree.saveSummary();
					switch (summary.version) {
						case WriteFormat.v0_0_2:
							return new MutableStringInterner();
						case WriteFormat.v0_1_1:
							return new MutableStringInterner((summary as SharedTreeSummary).internedStrings);
						default:
							fail(`Invalid summary format: ${summary.version}`);
					}
				}

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
					tree.applyEdit(...Change.insertTree(newNode, StablePlace.after(testTree.left)));
					tree.applyEdit(...Change.move(StableRange.only(newNode), StablePlace.before(testTree.left)));

					// Unit testing the interning of ops requires access violation since factory and messages are protected.
					type WithFactory<T> = T & { factory: MockContainerRuntimeFactory };
					type WithMessages<T> = T & { messages: ISequencedDocumentMessage[] };
					const factory = (remoteRuntime as unknown as WithFactory<MockContainerRuntime>).factory;
					const messages = (factory as unknown as WithMessages<MockContainerRuntimeFactory>).messages;

					expect(messages.length).to.equal(3);
					for (const message of messages.slice(1)) {
						// After the initial setup edit, common definitions should be interned
						for (const change of (message.contents as SharedTreeEditOp).edit.changes) {
							if (change.type === ChangeTypeInternal.CompressedBuild) {
								const stringifiedContents = JSON.stringify(message.contents);
								expect(stringifiedContents).to.not.include(SimpleTestTree.leftTraitLabel);
							}
						}
					}
					expect(tree.equals(secondTree)).to.be.false;

					containerRuntimeFactory.processAllMessages();
					const { internedStrings } = tree.saveSummary() as SharedTreeSummary;

					const log = getEditLogInternal(tree);
					const log2 = getEditLogInternal(secondTree);
					const insertEdit = normalizeEdit(tree, log.getEditInSessionAtIndex(1));
					const moveEdit = normalizeEdit(tree, log.getEditInSessionAtIndex(2));
					const insertEdit2 = normalizeEdit(secondTree, log2.getEditInSessionAtIndex(1));
					const moveEdit2 = normalizeEdit(secondTree, log2.getEditInSessionAtIndex(2));
					expect(insertEdit).to.deep.equal(insertEdit2);
					expect(moveEdit).to.deep.equal(moveEdit2);
					expect(tree.equals(secondTree)).to.be.true;
					expect(internedStrings).to.include(SimpleTestTree.leftTraitLabel);
					expect(internedStrings).to.include(newNode.definition);
				});

				it('compress summaries via interning and tree compression on save and decompress on load', () => {
					const {
						sharedTree: tree,
						testTree: testTree,
						containerRuntimeFactory,
					} = createSimpleTestTree({ writeFormat });

					const newNode = testTree.buildLeaf(testTree.generateNodeId());
					tree.applyEdit(...Change.insertTree(newNode, StablePlace.after(testTree.left)));
					tree.applyEdit(...Change.move(StableRange.only(newNode), StablePlace.before(testTree.left)));

					containerRuntimeFactory.processAllMessages();

					const summary = tree.saveSummary() as SharedTreeSummary;
					expect(summary.internedStrings).to.not.be.undefined;
					expect(summary.internedStrings.length).to.equal(5);

					const interner = new MutableStringInterner(summary.internedStrings);
					const treeCompressor = new InterningTreeCompressor();
					const expectedCompressedTree = treeCompressor.compress(
						getChangeNodeFromView(tree.currentView),
						interner,
						sequencedIdNormalizer(getIdNormalizerFromSharedTree(tree))
					);

					expect(summary.currentTree).deep.equal(expectedCompressedTree);

					const { tree: secondTree } = setUpTestSharedTree({ writeFormat });
					expect(tree.equals(secondTree)).to.be.false;
					secondTree.loadSummary(summary);
					expect(tree.equals(secondTree)).to.be.true;
				});

				it('compress and decompress edit chunks via interning and tree compression', async () => {
					const { tree, testObjectProvider } = await setUpLocalServerTestSharedTree({
						writeFormat,
					});
					const testTree = setUpTestTree(tree);

					const uncompressedEdits: EditWithoutId<ChangeInternal>[] = [
						{
							changes: getEditLogInternal(tree).getEditInSessionAtIndex(0).changes,
						},
					];

					// Apply enough edits for the upload of an edit chunk
					for (let i = 0; i < (tree.edits as EditLog).editsPerChunk - 1; i++) {
						const newNode = testTree.buildLeaf(testTree.generateNodeId());
						const edit = tree.applyEditInternal(
							ChangeInternal.insertTree([newNode], StablePlace.after(testTree.left))
						);
						uncompressedEdits.push({ changes: edit.changes });
					}

					await testObjectProvider.ensureSynchronized();

					const interner = getMutableStringInterner(tree);
					const expectedCompressedEdits: readonly EditWithoutId<CompressedChangeInternal<OpSpaceNodeId>>[] =
						new SharedTreeEncoder_0_1_1(true).encodeEditChunk(
							uncompressedEdits,
							sequencedIdNormalizer(testTree),
							interner
						).edits;

					// Apply one more edit so that an edit chunk gets uploaded
					const newNode = testTree.buildLeaf(testTree.generateNodeId());
					tree.applyEdit(...Change.insertTree(newNode, StablePlace.after(testTree.left)));

					// `ensureSynchronized` does not guarantee blob upload
					await new Promise((resolve) => setImmediate(resolve));
					// Wait for the ops to to be submitted and processed across the containers
					await testObjectProvider.ensureSynchronized();

					const summary = tree.saveSummary() as SharedTreeSummary;

					const { editHistory } = summary;
					const { editChunks } = assertNotUndefined(editHistory);
					expect(editChunks.length).to.equal(2);

					const handle = editChunks[0].chunk as FluidEditHandle;
					expect(typeof handle.get).to.equal('function');
					const chunkContents: EditChunkContents = JSON.parse(IsoBuffer.from(await handle.get()).toString());
					expect(chunkContents.edits).to.deep.equal(expectedCompressedEdits);

					const { tree: secondTree } = setUpTestSharedTree({ writeFormat });
					expect(tree.equals(secondTree)).to.be.false;
					secondTree.loadSummary(summary);
					expect(tree.equals(secondTree)).to.be.true;
					expect((await tree.edits.getEditAtIndex(2)).id).to.equal(
						(await secondTree.edits.getEditAtIndex(2)).id
					);
				});
			});
		}

		describe('mergeEditsFrom', () => {
			const getTestTreeRootHandle = (tree: SharedTree, testTree: TestTree): TreeNodeHandle => {
				const view = tree.currentView;
				const handle = new TreeNodeHandle(view, view.root);
				return handle.traits[testTree.traitLabel][0];
			};

			it('can be used with simple edits', () => {
				const { sharedTree, testTree } = createSimpleTestTree();
				const { sharedTree: sharedTree2, testTree: testTree2 } = createSimpleTestTree();
				sharedTree.applyEdit(...Change.insertTree(testTree.buildLeaf(), StablePlace.after(testTree.left)));
				sharedTree.applyEdit(
					Change.delete(StableRange.all({ parent: testTree.identifier, label: testTree.right.traitLabel }))
				);
				const preEditRootHandle = getTestTreeRootHandle(sharedTree2, testTree2);
				const edits = [0, 1, 2].map((i) => sharedTree.edits.getEditInSessionAtIndex(i));
				// Since the TestTree setup edit is a `setTrait`, this should wipe `testTree2` state.
				sharedTree2.mergeEditsFrom(sharedTree, edits);
				expect(sharedTree2.edits.length).to.equal(4);
				const rootHandle = getTestTreeRootHandle(sharedTree2, testTree2);
				expect(preEditRootHandle.identifier).to.not.equal(rootHandle.identifier);
				expect(rootHandle.traits[testTree2.left.traitLabel].length).to.equal(2);
			});

			it('can be used with a translation map', () => {
				const { sharedTree, testTree } = createSimpleTestTree();
				const { sharedTree: sharedTree2, testTree: testTree2 } = createSimpleTestTree();
				// For each of the identities in the simple test tree...
				const nodeIdGetters: ((tree: TestTree) => NodeId)[] = [
					(tree) => tree.identifier,
					(tree) => tree.left.identifier,
					(tree) => tree.right.identifier,
				];
				// Make a map translating that identifier from `testTree` to `testTree2`
				const translationMap = new Map(
					nodeIdGetters.map((getter) => [
						sharedTree.convertToStableNodeId(getter(testTree)),
						sharedTree2.convertToStableNodeId(getter(testTree2)),
					])
				);
				sharedTree.applyEdit(...Change.insertTree(testTree.buildLeaf(), StablePlace.after(testTree.left)));
				sharedTree.applyEdit(
					Change.delete(StableRange.all({ parent: testTree.identifier, label: testTree.right.traitLabel }))
				);
				const edits = [1, 2].map((i) => sharedTree.edits.getEditInSessionAtIndex(i));
				sharedTree2.mergeEditsFrom(sharedTree, edits, (id) => translationMap.get(id) ?? id);

				const root = getTestTreeRootHandle(sharedTree, testTree);
				const root2 = getTestTreeRootHandle(sharedTree2, testTree2);

				const leftTrait = root.traits[testTree.left.traitLabel];
				const leftTrait2 = root2.traits[testTree2.left.traitLabel];

				// Inserted leaves should be equivalent.
				expect(leftTrait2.length).to.equal(2);
				expect(leftTrait2[1]).to.deep.equal(leftTrait[1]);
				// Right subtree should have been deleted.
				expect(Object.entries(root2.traits).length).to.equal(1);
				expect(root2.traits[testTree2.right.traitLabel]).to.equal(undefined);
			});
		});
	});
}
