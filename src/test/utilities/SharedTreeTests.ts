/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, expect } from 'chai';
import { ITelemetryBaseEvent } from '@fluidframework/common-definitions';
import { MockContainerRuntimeFactory, MockFluidDataStoreRuntime } from '@fluidframework/test-runtime-utils';
import { assertArrayOfOne, assertNotUndefined, isSharedTreeEvent } from '../../Common';
import { Definition, DetachedSequenceId, EditId, TraitLabel } from '../../Identifiers';
import {
	BuildNode,
	ChangeNode,
	SharedTreeOpType,
	SharedTreeEvent,
	serialize,
	newEdit,
	EditStatus,
	EditCommittedEventArguments,
	SequencedEditAppliedEventArguments,
} from '../../generic';
import { Change, ChangeType, Delete, Insert, StablePlace, StableRange, SharedTree, Move } from '../../default-edits';
import { CachingLogViewer } from '../../LogViewer';
import { EditLog } from '../../EditLog';
import { initialTree } from '../../InitialTree';
import { TreeNodeHandle } from '../../TreeNodeHandle';
import { deserialize, SharedTreeSummary_0_0_2 } from '../../SummaryBackCompatibility';
import { SharedTreeWithAnchors } from '../../anchored-edits';
import { RevisionView } from '../../TreeView';
import { useFailedSequencedEditTelemetry } from '../../MergeHealth';
import {
	testTrait,
	areNodesEquivalent,
	assertNoDelta,
	deepCompareNodes,
	initialRevisionView,
	SharedTreeTestingComponents,
	SharedTreeTestingOptions,
	testSimpleSharedTree,
	refreshSimpleSharedTree,
} from './TestUtilities';
import { runSharedTreeUndoRedoTestSuite } from './UndoRedoTests';
import { TestFluidHandle, TestFluidSerializer } from './TestSerializer';
import { TestTree } from './TestNode';

function revertEditInTree(tree: SharedTree, edit: EditId): EditId {
	return tree.revert(edit);
}

// Options for the undo/redo test suite. The undo and redo functions are the same.
const undoRedoOptions = {
	title: 'Revert',
	undo: revertEditInTree,
	redo: revertEditInTree,
};

/**
 * Runs a test suite for operations on `SharedTree`.
 * This suite can be used to test other implementations that aim to fulfill `SharedTree`'s contract.
 */
export function runSharedTreeOperationsTests<TSharedTree extends SharedTree | SharedTreeWithAnchors>(
	title: string,
	setUpTestSharedTree: (options?: SharedTreeTestingOptions) => SharedTreeTestingComponents<TSharedTree>
) {
	/**
	 * Convenience bundling of test components.
	 * Like {@link SharedTreeTestingComponents}, but contains both the {@link SimpleTestTree} and
	 * its associated {@link TSharedTree}.
	 */
	interface SharedTreeTest {
		/**
		 * {@inheritDoc SharedTreeTestingComponents.tree}
		 */
		sharedTree: TSharedTree;

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
		const testTree = testSimpleSharedTree(sharedTree);
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
				expect(tree.currentView.getTrait(testTrait)).deep.equals(
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

				const childNode = testTree.buildLeaf();
				const childId = 0 as DetachedSequenceId;
				const childrenTraitLabel = 'children' as TraitLabel;
				const parentNode: BuildNode = {
					identifier: testTree.generateId(),
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
					identifier: testTree.generateId(),
					definition: 'node' as Definition,
					traits: {
						[childrenTraitLabel]: [childId],
					},
				};
				const parentId = 1 as DetachedSequenceId;
				const parentNode2: BuildNode = {
					identifier: testTree.generateId(),
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

				const detachedNode = testTree.buildLeaf();
				const detachedSequenceId = 0 as DetachedSequenceId;
				const { id } = sharedTree.applyEdit(
					Change.build([detachedNode], detachedSequenceId),
					Change.setPayload(detachedNode.identifier, 42),
					Change.insert(detachedSequenceId, StablePlace.before(testTree.left))
				);
				const logViewer = sharedTree.logViewer as CachingLogViewer<Change>;
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
				const logViewer = sharedTree.logViewer as CachingLogViewer<Change>;
				expect(logViewer.getEditResultInSession(logViewer.log.getIndexOfId(id)).status).equals(
					EditStatus.Invalid
				);
				sharedTree.currentView.assertConsistent();
			});

			it('prevents deletion of the root', () => {
				const { sharedTree } = createSimpleTestTree({ allowInvalid: true });
				expect(sharedTree.currentView.hasNode(initialRevisionView.root));
				assertNoDelta(sharedTree, () => {
					// Try to delete the root
					sharedTree.applyEdit(Delete.create(StableRange.only(initialRevisionView.root)));
				});
			});

			it('can apply multiple local edits without ack from server', () => {
				const { sharedTree, testTree } = createSimpleTestTree();

				const newNode = testTree.buildLeaf();

				sharedTree.applyEdit(...Insert.create([newNode], StablePlace.after(testTree.left)));
				sharedTree.applyEdit(...Move.create(StableRange.only(newNode), StablePlace.before(testTree.left)));

				const leftTrait = sharedTree.currentView.getTrait(testTree.left.traitLocation);
				expect(leftTrait.length).equals(2);
				expect(leftTrait[0]).equals(newNode.identifier);
			});

			it('is not equal to a tree with different initial views', () => {
				const { sharedTree: sharedTree1, testTree } = createSimpleTestTree();

				const initialTree2: ChangeNode = {
					...testTree.buildLeaf(),
					traits: {
						[testTree.left.traitLabel]: [testTree.left],
						[testTree.right.traitLabel]: [testTree.right],
					},
					identifier: testTree.generateId(),
				};

				const { tree: sharedTree2 } = setUpTestSharedTree({ initialTree: initialTree2 });

				expect(sharedTree1.equals(sharedTree2)).to.be.false;
			});

			it('is not equal to a tree with the same view but different edit lists', () => {
				const { sharedTree: sharedTree1 } = createSimpleTestTree();
				const { sharedTree: sharedTree2 } = createSimpleTestTree();

				// The edits that create the initial tree have different identities.
				expect(sharedTree1.equals(sharedTree2)).to.be.false;
			});

			it('tolerates invalid inserts', () => {
				const { sharedTree, testTree } = createSimpleTestTree({ allowInvalid: true });

				const firstNode = testTree.buildLeaf();
				const secondNode = testTree.buildLeaf();

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

				const firstNode = testTree.buildLeaf();
				const secondNode = testTree.buildLeaf();
				const thirdNode = testTree.buildLeaf();

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
				const {
					sharedTree: sharedTree1,
					testTree,
					containerRuntimeFactory,
				} = createSimpleTestTree(tree1Options);
				const { tree: sharedTree2 } = setUpTestSharedTree(createSecondTreeOptions(containerRuntimeFactory));

				// Sync initial tree
				containerRuntimeFactory.processAllMessages();

				// Both trees should contain 'left'
				expect(sharedTree1.currentView.getViewNode(testTree.left.identifier)).to.not.be.undefined;
				expect(sharedTree2.currentView.getViewNode(testTree.left.identifier)).to.not.be.undefined;

				sharedTree2.applyEdit(Delete.create(StableRange.only(testTree.left)));

				containerRuntimeFactory.processAllMessages();

				const rootA = sharedTree1.currentView.getViewNode(testTree.identifier);
				expect(rootA.traits.get(testTree.left.traitLabel)).to.be.undefined;

				const rootB = sharedTree2.currentView.getViewNode(testTree.identifier);
				expect(rootB.traits.get(testTree.left.traitLabel)).to.be.undefined;
			});

			it('should apply local edits after all sequenced edits', () => {
				const {
					sharedTree: sharedTree1,
					testTree,
					containerRuntimeFactory,
				} = createSimpleTestTree(tree1Options);
				const { tree: sharedTree2 } = setUpTestSharedTree(createSecondTreeOptions(containerRuntimeFactory));

				// Sync initial tree
				containerRuntimeFactory.processAllMessages();

				const newNode = testTree.buildLeaf();

				sharedTree1.applyEdit(...Insert.create([newNode], StablePlace.after(testTree.left)));

				containerRuntimeFactory.processAllMessages();

				// Concurrently perform edit that will be sequenced before the move below.
				// If local edits are sorted incorrectly (before sequenced edits), this will cause evaluation of a state in which the local
				// move is evaluated before all other edits. Since it is causally dependant on the initial insert edit, it would fail.
				sharedTree2.applyEdit(Delete.create(StableRange.only(testTree.right)));

				// Attempt to move the new node.
				sharedTree1.applyEdit(...Move.create(StableRange.only(newNode), StablePlace.before(testTree.left)));

				// Deliver the remote edit. The move should be applied after all sequenced edits and succeed.
				containerRuntimeFactory.processAllMessages();
			});

			it('converges in the face of concurrent changes', () => {
				const {
					sharedTree: sharedTree1,
					testTree,
					containerRuntimeFactory,
				} = createSimpleTestTree(tree1Options);
				const { tree: sharedTree2 } = setUpTestSharedTree(createSecondTreeOptions(containerRuntimeFactory));

				// Sync initial tree
				containerRuntimeFactory.processAllMessages();

				// First client deletes a trait containing a node in the initial tree
				sharedTree1.applyEdit(Delete.create(StableRange.only(testTree.left)));

				// Second client concurrently adds a new node to that trait
				const newNode = testTree.buildLeaf();
				sharedTree2.applyEdit(...Insert.create([newNode], StablePlace.atEndOf(testTree.left.traitLocation)));

				containerRuntimeFactory.processAllMessages();

				// Second client's change gets sequenced after the deletion, so the trait
				// should exist and contain the new node on both clients after messages are delivered.
				const leftTrait = sharedTree1.currentView.getTrait(testTree.left.traitLocation);
				const secondLeftTrait = sharedTree2.currentView.getTrait(testTree.left.traitLocation);
				expect(leftTrait.length).equals(1);
				expect(leftTrait[0]).equals(newNode.identifier);
				expect(leftTrait).deep.equals(secondLeftTrait);
			});

			it('is equal to a tree with the same state', () => {
				const {
					sharedTree: sharedTree1,
					testTree,
					containerRuntimeFactory,
				} = createSimpleTestTree(tree1Options);
				const { tree: sharedTree2 } = setUpTestSharedTree(createSecondTreeOptions(containerRuntimeFactory));

				containerRuntimeFactory.processAllMessages();
				expect(sharedTree1.equals(sharedTree2)).to.be.true;
				sharedTree2.applyEdit(Delete.create(StableRange.only(testTree.left)));
				containerRuntimeFactory.processAllMessages();
				expect(sharedTree1.equals(sharedTree2)).to.be.true;
			});

			// TODO:#58052: Make this test pass.
			it.skip('prevents inserting a node in a detached subtree as the result of merged edits', () => {
				const { testTree } = createSimpleTestTree();

				const rootNode = testTree.buildLeaf();

				const parent1Node = testTree.buildLeaf();

				const parent2Node = testTree.buildLeaf();
				const parent2Id = parent2Node.identifier;

				const childNode = testTree.buildLeaf();
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
				const logViewer = sharedTree1.logViewer as CachingLogViewer<Change>;
				expect(logViewer.getEditResultInSession(logViewer.log.getIndexOfId(edit1.id)).status).equals(
					EditStatus.Applied
				);
				expect(logViewer.getEditResultInSession(logViewer.log.getIndexOfId(edit2.id)).status).equals(
					EditStatus.Invalid
				);
				sharedTree1.currentView.assertConsistent();
			});

			it('tolerates invalid inserts', () => {
				const {
					sharedTree: sharedTree1,
					testTree,
					containerRuntimeFactory,
				} = createSimpleTestTree({
					...tree1Options,
					allowInvalid: true,
				});
				const { tree: sharedTree2 } = setUpTestSharedTree({
					...createSecondTreeOptions(containerRuntimeFactory),
					allowInvalid: true,
				});

				containerRuntimeFactory.processAllMessages();

				const firstNode = testTree.buildLeaf();
				const firstEdit = sharedTree2.applyEdit(
					...Insert.create([firstNode], StablePlace.after(testTree.left))
				);
				containerRuntimeFactory.processAllMessages();

				// Concurrently edit, creating invalid insert.
				// Create delete. This will apply.
				const secondEdit = sharedTree1.applyEdit(Delete.create(StableRange.only(firstNode)));

				let thirdEdit;
				assertNoDelta(sharedTree1, () => {
					// concurrently insert next to the deleted node: this will become invalid.
					const secondNode = testTree.buildLeaf();
					thirdEdit = sharedTree2.applyEdit(...Insert.create([secondNode], StablePlace.after(firstNode)));
					containerRuntimeFactory.processAllMessages();
				});

				const leftTrait = sharedTree2.currentView.getTrait(testTree.left.traitLocation);
				expect(leftTrait.length).to.equal(1);

				const editIds = sharedTree1.edits.editIds;

				// Edit 0 creates initial tree
				expect(editIds[1]).is.equal(firstEdit.id);
				expect(editIds[2]).is.equal(secondEdit.id);
				expect(editIds[3]).is.equal(thirdEdit.id);
			});

			it('tolerates invalid detaches', () => {
				const {
					sharedTree: sharedTree1,
					testTree,
					containerRuntimeFactory,
				} = createSimpleTestTree({ ...tree1Options, allowInvalid: true });
				const { tree: sharedTree2 } = setUpTestSharedTree(createSecondTreeOptions(containerRuntimeFactory));

				containerRuntimeFactory.processAllMessages();

				const firstNode = testTree.buildLeaf();
				const secondNode = testTree.buildLeaf();
				const thirdNode = testTree.buildLeaf();
				const firstEdit = sharedTree2.applyEdit(
					...Insert.create([firstNode, secondNode, thirdNode], StablePlace.after(testTree.left))
				);
				containerRuntimeFactory.processAllMessages();

				// Concurrently edit, creating invalid insert.
				// Create delete. This will apply.
				const secondEdit = sharedTree1.applyEdit(Delete.create(StableRange.only(secondNode)));

				let thirdEdit;
				assertNoDelta(sharedTree1, () => {
					// concurrently delete from before firstNode to after secondNode: this should become invalid
					thirdEdit = sharedTree2.applyEdit(
						Delete.create(StableRange.from(StablePlace.before(firstNode)).to(StablePlace.after(secondNode)))
					);
				});

				containerRuntimeFactory.processAllMessages();

				// Expect that firstNode did not get deleted
				const leftTrait = sharedTree1.currentView.getTrait(testTree.left.traitLocation);
				expect(leftTrait.length).to.equal(3);

				const editIds = sharedTree1.edits.editIds;
				// Edit 0 creates initial tree
				expect(editIds[1]).to.equal(firstEdit.id);
				expect(editIds[2]).to.equal(secondEdit.id);
				expect(editIds[3]).to.equal(thirdEdit.id);
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
					remoteRuntime.submit({ type: SharedTreeOpType.Edit, edit }, /* localOpMetadata */ undefined);
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
				const parsedTree = deserialize(serialized, testSerializer) as SharedTreeSummary_0_0_2<unknown>;
				expect(parsedTree.sequencedEdits).deep.equal([]);
				expect(deepCompareNodes(parsedTree.currentTree, initialTree)).to.be.true;
			});

			[true, false].forEach((hasLocalEdits) => {
				it(`produces correct snapshot for a tree with ${hasLocalEdits ? 'local' : 'acked'} edits`, () => {
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
					const treeContent = JSON.parse(serialized);
					const parsedTree = treeContent as SharedTreeSummary_0_0_2<Change>;

					expect(parsedTree.currentTree).to.not.be.undefined;
					const testRoot = assertArrayOfOne(parsedTree.currentTree.traits[testTrait.label]);
					expect(testRoot).to.not.be.undefined;
					expect(testRoot.traits.left).to.not.be.undefined;
					expect(testRoot.traits.right).to.not.be.undefined;
					expect(testRoot.traits.left.length).to.equal(2);

					expect(parsedTree.sequencedEdits).to.not.be.undefined;
					const sequencedEdits = assertNotUndefined(parsedTree.sequencedEdits);

					// Expect there to be a change in the edit history in addition to the one from setUpTestSharedTree
					expect(sequencedEdits.length).to.equal(2);
					// The first operation to be sequenced is the tree init
					expect(sequencedEdits[1].changes.length).to.equal(2);
					expect(sequencedEdits[1].changes[0].type).to.equal(ChangeType.Build);
					expect(sequencedEdits[1].changes[1].type).to.equal(ChangeType.Insert);
				});
			});

			it('can be used to initialize a tree', () => {
				const {
					sharedTree: sharedTree1,
					testTree: testTree1,
					containerRuntimeFactory,
				} = createSimpleTestTree({ localMode: false });
				const { sharedTree: sharedTree2 } = createSimpleTestTree();

				const newNode = testTree1.buildLeaf();

				sharedTree1.applyEdit(...Insert.create([newNode], StablePlace.before(testTree1.left)));
				containerRuntimeFactory.processAllMessages();

				sharedTree2.loadSummary(sharedTree1.saveSummary());

				// Trees should have equal state since we deserialized the first tree's state into the second tree
				expect(sharedTree1.equals(sharedTree2)).to.be.true;
			});

			it('can be used to initialize a tree with an empty edit list', () => {
				const { sharedTree: sharedTree1, containerRuntimeFactory } = createSimpleTestTree({ localMode: false });
				const { sharedTree: sharedTree2 } = createSimpleTestTree();

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
					const insertee = testTree.buildLeaf();
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

		describe('correctly diffs revision views', () => {
			const testTree = refreshSimpleSharedTree(() => setUpTestSharedTree().tree);

			it('that are the same object', () => {
				const view = RevisionView.fromTree(testTree.buildLeaf());
				expect(view.delta(view)).deep.equals({
					changed: [],
					added: [],
					removed: [],
				});
			});

			it('that have the same tree', () => {
				const node = testTree.buildLeaf();
				const viewA = RevisionView.fromTree(node);
				const viewB = RevisionView.fromTree(node);
				expect(viewA.delta(viewB)).deep.equals({
					changed: [],
					added: [],
					removed: [],
				});
			});

			it('with different root ids', () => {
				const viewA = RevisionView.fromTree(testTree.buildLeaf());
				const viewB = RevisionView.fromTree(testTree.buildLeaf());
				expect(() => viewA.delta(viewB)).to.throw(
					'Delta can only be calculated between views that share a root'
				);
			});

			it('with different subtrees', () => {
				const rootId = testTree.generateId();

				const leafA = testTree.buildLeaf();
				const leafB = testTree.buildLeaf();

				const subtreeA = {
					identifier: testTree.generateId(),
					definition: 'node' as Definition,
					traits: { children: [leafA] },
				};
				const subtreeB = {
					identifier: testTree.generateId(),
					definition: 'node' as Definition,
					traits: { children: [leafB] },
				};

				const rootA: ChangeNode = {
					identifier: rootId,
					definition: 'node' as Definition,
					traits: {
						children: [subtreeA],
					},
				};
				const rootB: ChangeNode = {
					identifier: rootId,
					definition: 'node' as Definition,
					traits: {
						children: [subtreeB],
					},
				};

				const viewA = RevisionView.fromTree(rootA);
				const viewB = RevisionView.fromTree(rootB);
				const delta = viewA.delta(viewB);
				expect(delta.changed).deep.equals([rootId]);
				expect(delta.removed.length).equals(2);
				expect(delta.added.length).equals(2);
				expect(delta.removed).contains(subtreeA.identifier);
				expect(delta.removed).contains(leafA.identifier);
				expect(delta.added).contains(subtreeB.identifier);
				expect(delta.added).contains(leafB.identifier);
			});

			it('with different payloads', () => {
				const rootId = testTree.generateId();
				const nodeA: ChangeNode = {
					identifier: rootId,
					definition: 'node' as Definition,
					payload: 'test1',
					traits: {},
				};
				const nodeB: ChangeNode = {
					identifier: rootId,
					definition: 'node' as Definition,
					payload: 'test2',
					traits: {},
				};

				const viewA = RevisionView.fromTree(nodeA);
				const viewB = RevisionView.fromTree(nodeB);
				const delta = viewA.delta(viewB);
				expect(delta.changed).deep.equals([rootId]);
				expect(delta.removed).deep.equals([]);
				expect(delta.added).deep.equals([]);
			});

			it('after an insert', () => {
				const { sharedTree, testTree } = createSimpleTestTree();

				const viewA = sharedTree.currentView;
				const insertedNode = testTree.buildLeaf();
				sharedTree.applyEdit(...Insert.create([insertedNode], StablePlace.before(testTree.left)));
				const viewB = sharedTree.currentView;
				const delta = viewA.delta(viewB);
				assert(delta);
				expect(delta.changed).deep.equals([testTree.identifier]);
				expect(delta.removed).deep.equals([]);
				expect(delta.added).deep.equals([insertedNode.identifier]);
			});

			it('after a delete', () => {
				const { sharedTree, testTree } = createSimpleTestTree();

				const viewA = sharedTree.currentView;
				sharedTree.applyEdit(Delete.create(StableRange.only(testTree.left)));
				const viewB = sharedTree.currentView;
				const delta = viewA.delta(viewB);
				assert(delta);
				expect(delta.changed).deep.equals([testTree.identifier]);
				expect(delta.removed).deep.equals([testTree.left.identifier]);
				expect(delta.added).deep.equals([]);
			});

			it('after a move', () => {
				const { sharedTree, testTree } = createSimpleTestTree();

				const viewA = sharedTree.currentView;
				sharedTree.applyEdit(
					...Move.create(StableRange.only(testTree.left), StablePlace.after(testTree.right))
				);
				const viewB = sharedTree.currentView;
				const delta = viewA.delta(viewB);
				assert(delta);
				expect(delta.changed).deep.equals([testTree.identifier]);
				expect(delta.removed).deep.equals([]);
				expect(delta.added).deep.equals([]);
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

			it('can be fully demanded', () => {
				const { sharedTree, testTree } = createSimpleTestTree();
				const rootHandle = new TreeNodeHandle(sharedTree.currentView, testTree.identifier);
				const rootNode = rootHandle.demandTree();
				expect(areNodesEquivalent(testTree, rootNode)).to.be.true;
				const printBeforeDemand = JSON.stringify(rootNode);
				// Demand the tree by walking into its traits. If they were lazy, this would change the `rootNode` object.
				expect(areNodesEquivalent(testTree.left, rootNode.traits.left[0])).to.be.true;
				expect(areNodesEquivalent(testTree.right, rootNode.traits.right[0])).to.be.true;
				// Ensure that they were _not_ lazy by comparing with the initial print of the tree
				expect(JSON.stringify(rootNode)).equals(printBeforeDemand);
			});

			it('implement toString', () => {
				const { sharedTree, testTree } = createSimpleTestTree();
				const rootHandle = new TreeNodeHandle(sharedTree.currentView, testTree.identifier);
				const print = `${rootHandle}`;
				// Shouldn't print the default toString for objects
				expect(print.startsWith('[object')).to.be.false;
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
						...Insert.create([testTree.buildLeaf()], StablePlace.after(testTree.buildLeaf()))
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
						...Insert.create([testTree.buildLeaf()], StablePlace.after(testTree.buildLeaf()))
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
						...Insert.create([testTree.buildLeaf()], StablePlace.after(testTree.buildLeaf()))
					);
					expect(events.length).equals(0);
					containerRuntimeFactory.processAllMessages();
					await sharedTree.logViewer.getRevisionView(Number.POSITIVE_INFINITY);
					expect(events.length).equals(1);
					expect(events[0].eventName).equals('SharedTree:SequencedEditApplied:InvalidSharedTreeEdit');

					disable();

					sharedTree.applyEdit(
						...Insert.create([testTree.buildLeaf()], StablePlace.after(testTree.buildLeaf()))
					);
					containerRuntimeFactory.processAllMessages();
					await sharedTree.logViewer.getRevisionView(Number.POSITIVE_INFINITY);
					expect(events.length).equals(1);

					useFailedSequencedEditTelemetry(sharedTree);

					sharedTree.applyEdit(
						...Insert.create([testTree.buildLeaf()], StablePlace.after(testTree.buildLeaf()))
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
						...Insert.create([testTree2.buildLeaf()], StablePlace.after(testTree2.buildLeaf()))
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
				sharedTree.on(SharedTreeEvent.EditCommitted, (args: EditCommittedEventArguments<TSharedTree>) => {
					expect(args.local).true;
					expect(args.tree).equals(sharedTree);
					editIdFromEvent = args.editId;
					eventCount += 1;
				});

				// Invalid change
				const invalidEdit = sharedTree.applyEdit(
					...Insert.create([testTree.buildLeaf()], StablePlace.after(testTree.buildLeaf()))
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

				const eventArgs: SequencedEditAppliedEventArguments<TSharedTree>[] = [];
				sharedTree1.on(
					SharedTreeEvent.SequencedEditApplied,
					(args: SequencedEditAppliedEventArguments<TSharedTree>) => eventArgs.push(args)
				);

				// Invalid change
				const change = Change.setPayload(testTree.buildLeaf().identifier, 42);
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
	});
}
