/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, expect } from 'chai';
import { v4 as uuidv4 } from 'uuid';
import { ITelemetryBaseEvent } from '@fluidframework/common-definitions';
import { MockFluidDataStoreRuntime } from '@fluidframework/test-runtime-utils';
import { delay } from '@fluidframework/common-utils';
import { assertArrayOfOne, assertNotUndefined, isSharedTreeEvent } from '../Common';
import { Definition, DetachedSequenceId, EditId, NodeId, TraitLabel } from '../Identifiers';
import {
	EditNode,
	ChangeNode,
	SharedTreeOpType,
	SharedTreeEvent,
	fullHistorySummarizer,
	serialize,
	newEdit,
} from '../generic';
import {
	Change,
	ChangeType,
	Delete,
	Insert,
	StablePlace,
	StableRange,
	noHistorySummarizer,
	SharedTree,
} from '../default-edits';
import { editsPerChunk } from '../EditLog';
import { Snapshot } from '../Snapshot';
import { initialTree } from '../InitialTree';
import { TreeNodeHandle } from '../TreeNodeHandle';
import { deserialize, SharedTreeSummary_0_0_2 } from '../SummaryBackCompatibility';
import {
	makeEmptyNode,
	setUpTestSharedTree,
	testTrait,
	left,
	right,
	leftTraitLabel,
	leftTraitLocation,
	rightTraitLocation,
	simpleTestTree,
	areNodesEquivalent,
	rightTraitLabel,
	assertNoDelta,
	deepCompareNodes,
} from './utilities/TestUtilities';
import { runSharedTreeUndoRedoTestSuite } from './utilities/UndoRedoTests';
import { TestFluidHandle, TestFluidSerializer } from './utilities/TestSerializer';

const revert = (tree: SharedTree, editId: EditId) => {
	const editIndex = tree.edits.getIndexOfId(editId);
	return tree.editor.revert(
		tree.edits.getEditInSessionAtIndex(editIndex),
		tree.logViewer.getSnapshotInSession(editIndex)
	);
};

// Options for the undo/redo test suite. The undo and redo functions are the same.
const undoRedoOptions = {
	title: 'Revert',
	undo: revert,
	redo: revert,
};

describe('SharedTree', () => {
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
			const { tree } = setUpTestSharedTree({ initialTree: simpleTestTree });
			let changeCount = 0;
			tree.on(SharedTreeEvent.EditCommitted, () => {
				const leftTrait = tree.currentView.getTrait(leftTraitLocation);
				const rightTrait = tree.currentView.getTrait(rightTraitLocation);

				expect(leftTrait.length).to.equal(0); // "left" child is deleted...
				expect(rightTrait.length).to.equal(2); // ...and added to "right" trait

				changeCount += 1;
			});

			tree.editor.move(left, StablePlace.after(right));
			expect(changeCount).equals(1);
		});

		it('can insert a wrapped tree', () => {
			const { tree } = setUpTestSharedTree({ initialTree: simpleTestTree });

			const childNode = makeEmptyNode();
			const childId = 0 as DetachedSequenceId;
			const childrenTraitLabel = 'children' as TraitLabel;
			const parentNode: EditNode = {
				identifier: uuidv4() as NodeId,
				definition: 'node' as Definition,
				traits: {
					[childrenTraitLabel]: [childId],
				},
			};
			const parentId = 1 as DetachedSequenceId;

			const buildChild = Change.build([childNode], childId);
			const buildParent = Change.build([parentNode], parentId);
			const insertParent = Change.insert(parentId, StablePlace.before(left));

			tree.applyEdit(buildChild, buildParent, insertParent);

			const leftTrait = tree.currentView.getTrait(leftTraitLocation);
			expect(leftTrait.length).to.equal(2);
			expect(leftTrait[0]).to.equal(parentNode.identifier);
			const childrenTrait = tree.currentView.getTrait({
				parent: parentNode.identifier,
				label: childrenTraitLabel,
			});
			expect(childrenTrait.length).to.equal(1);
			expect(childrenTrait[0]).to.equal(childNode.identifier);
		});

		it('prevents multiparenting detached trees', () => {
			const { tree } = setUpTestSharedTree({ initialTree: simpleTestTree });

			const childNode = makeEmptyNode();
			const childId = 0 as DetachedSequenceId;
			const childrenTraitLabel = 'children' as TraitLabel;
			const parentNode: EditNode = {
				identifier: uuidv4() as NodeId,
				definition: 'node' as Definition,
				traits: {
					[childrenTraitLabel]: [childId],
				},
			};
			const parentId = 1 as DetachedSequenceId;
			const parentNode2: EditNode = {
				identifier: uuidv4() as NodeId,
				definition: 'node' as Definition,
				traits: {
					[childrenTraitLabel]: [childId],
				},
			};
			const parentId2 = 2 as DetachedSequenceId;

			const buildChild = Change.build([childNode], childId);
			const buildParent = Change.build([parentNode], parentId);
			const buildParent2 = Change.build([parentNode2], parentId2);

			assertNoDelta(tree, () => {
				// we don't expect this edit application to change anything
				tree.applyEdit(buildChild, buildParent, buildParent2);
			});
		});

		it('prevents deletion of the root', () => {
			const { tree } = setUpTestSharedTree({ initialTree: simpleTestTree });
			expect(tree.currentView.hasNode(initialTree.identifier));
			assertNoDelta(tree, () => {
				// Try to delete the root
				tree.processLocalEdit(newEdit([Delete.create(StableRange.only(initialTree))]));
			});
		});

		it('can apply multiple local edits without ack from server', () => {
			const { tree } = setUpTestSharedTree({ initialTree: simpleTestTree });

			const newNode = makeEmptyNode();

			tree.editor.insert(newNode, StablePlace.after(left));
			tree.editor.move(newNode, StablePlace.before(left));

			const leftTrait = tree.currentView.getTrait(leftTraitLocation);
			expect(leftTrait.length).equals(2);
			expect(leftTrait[0]).equals(newNode.identifier);
		});

		it('is not equal to a tree with different initial views', () => {
			const secondSimpleTestTree: ChangeNode = {
				...simpleTestTree,
				identifier: uuidv4() as NodeId,
			};

			const { tree } = setUpTestSharedTree({ initialTree: simpleTestTree });
			const { tree: secondTree } = setUpTestSharedTree({ initialTree: secondSimpleTestTree });

			expect(tree.equals(secondTree)).to.be.false;
		});

		it('is not equal to a tree with the same view but different edit lists', () => {
			const { tree } = setUpTestSharedTree({ initialTree: simpleTestTree });
			const { tree: secondTree } = setUpTestSharedTree({ initialTree: simpleTestTree });
			// The edits that create the initial tree have different identities.
			expect(tree.equals(secondTree)).to.be.false;
		});

		it('tolerates invalid inserts', () => {
			const { tree } = setUpTestSharedTree({ initialTree: simpleTestTree });

			const firstNode = makeEmptyNode();
			const secondNode = makeEmptyNode();

			tree.editor.insert(firstNode, StablePlace.after(left));
			tree.editor.delete(firstNode);

			// Trying to insert next to the deleted node should drop, confirm that it doesn't
			// change the snapshot
			assertNoDelta(tree, () => {
				tree.processLocalEdit(newEdit(Insert.create([secondNode], StablePlace.after(firstNode))));
			});

			const leftTrait = tree.currentView.getTrait(leftTraitLocation);
			expect(leftTrait.length).to.equal(1);
		});

		it('tolerates invalid detaches', () => {
			const { tree } = setUpTestSharedTree({ initialTree: simpleTestTree });

			const firstNode = makeEmptyNode();
			const secondNode = makeEmptyNode();
			const thirdNode = makeEmptyNode();

			tree.editor.insert([firstNode, secondNode, thirdNode], StablePlace.after(left));
			tree.editor.delete(secondNode);

			assertNoDelta(tree, () => {
				// Trying to delete from before firstNode to after secondNode should drop
				tree.processLocalEdit(
					newEdit([
						Delete.create(
							StableRange.from(StablePlace.before(firstNode)).to(StablePlace.after(secondNode))
						),
					])
				);

				// Trying to delete from after thirdNode to before firstNode should drop
				tree.processLocalEdit(
					newEdit([
						Delete.create(StableRange.from(StablePlace.after(thirdNode)).to(StablePlace.before(firstNode))),
					])
				);
			});

			// Expect that firstNode did not get deleted
			const leftTrait = tree.currentView.getTrait(leftTraitLocation);
			expect(leftTrait.length).to.equal(3);
		});

		it('tolerates malformed inserts', () => {
			const { tree } = setUpTestSharedTree({ initialTree: simpleTestTree });

			assertNoDelta(tree, () => {
				tree.processLocalEdit(newEdit([Change.build([], 0 as DetachedSequenceId)]));
			});
		});

		runSharedTreeUndoRedoTestSuite({ localMode: true, ...undoRedoOptions });
	});

	describe('SharedTree in connected state with a remote SharedTree', () => {
		const treeOptions = { initialTree: simpleTestTree, localMode: false };
		const secondTreeOptions = {
			id: 'secondTestSharedTree',
			localMode: false,
		};

		it('should apply remote changes and converge', () => {
			const { tree, containerRuntimeFactory } = setUpTestSharedTree(treeOptions);
			const { tree: secondTree } = setUpTestSharedTree({ containerRuntimeFactory, ...secondTreeOptions });

			// Sync initial tree
			containerRuntimeFactory.processAllMessages();

			// Both trees should contain 'left'
			expect(tree.currentView.getSnapshotNode(left.identifier)).to.not.be.undefined;
			expect(secondTree.currentView.getSnapshotNode(left.identifier)).to.not.be.undefined;

			secondTree.editor.delete(left);

			containerRuntimeFactory.processAllMessages();

			const rootA = tree.currentView.getSnapshotNode(simpleTestTree.identifier);
			expect(rootA.traits.get(leftTraitLabel)).to.be.undefined;

			const rootB = secondTree.currentView.getSnapshotNode(simpleTestTree.identifier);
			expect(rootB.traits.get(leftTraitLabel)).to.be.undefined;
		});

		it('should apply local edits after all sequenced edits', () => {
			const { tree, containerRuntimeFactory } = setUpTestSharedTree(treeOptions);
			const { tree: secondTree } = setUpTestSharedTree({ containerRuntimeFactory, ...secondTreeOptions });

			// Sync initial tree
			containerRuntimeFactory.processAllMessages();

			const newNode = makeEmptyNode();

			tree.editor.insert(newNode, StablePlace.after(left));

			containerRuntimeFactory.processAllMessages();

			// Concurrently perform edit that will be sequenced before the move below.
			// If local edits are sorted incorrectly (before sequenced edits), this will cause evaluation of a state in which the local
			// move is evaluated before all other edits. Since it is causally dependant on the initial insert edit, it would fail.
			secondTree.editor.delete(right);

			// Attempt to move the new node.
			tree.editor.move(newNode, StablePlace.before(left));

			// Deliver the remote edit. The move should be applied after all sequenced edits and succeed.
			containerRuntimeFactory.processAllMessages();
		});

		it('converges in the face of concurrent changes', () => {
			const { tree, containerRuntimeFactory } = setUpTestSharedTree(treeOptions);
			const { tree: secondTree } = setUpTestSharedTree({ containerRuntimeFactory, ...secondTreeOptions });

			// Sync initial tree
			containerRuntimeFactory.processAllMessages();

			// First client deletes a trait containing a node in the initial tree
			tree.editor.delete(left);

			// Second client concurrently adds a new node to that trait
			const newNode = makeEmptyNode();
			secondTree.editor.insert(newNode, StablePlace.atEndOf(leftTraitLocation));

			containerRuntimeFactory.processAllMessages();

			// Second client's change gets sequenced after the deletion, so the trait
			// should exist and contain the new node on both clients after messages are delivered.
			const leftTrait = tree.currentView.getTrait(leftTraitLocation);
			const secondLeftTrait = secondTree.currentView.getTrait(leftTraitLocation);
			expect(leftTrait.length).equals(1);
			expect(leftTrait[0]).equals(newNode.identifier);
			expect(leftTrait).deep.equals(secondLeftTrait);
		});

		it('is equal to a tree with the same state', () => {
			const { tree, containerRuntimeFactory } = setUpTestSharedTree(treeOptions);
			const { tree: secondTree } = setUpTestSharedTree({ containerRuntimeFactory, ...secondTreeOptions });

			containerRuntimeFactory.processAllMessages();
			expect(tree.equals(secondTree)).to.be.true;
			secondTree.editor.delete(left);
			containerRuntimeFactory.processAllMessages();
			expect(tree.equals(secondTree)).to.be.true;
		});

		it('tolerates invalid inserts', () => {
			const { tree, containerRuntimeFactory } = setUpTestSharedTree({ ...treeOptions });
			const { tree: secondTree } = setUpTestSharedTree({
				containerRuntimeFactory,
				...secondTreeOptions,
			});

			containerRuntimeFactory.processAllMessages();

			const firstNode = makeEmptyNode();
			const firstEditId = secondTree.editor.insert(firstNode, StablePlace.after(left));
			containerRuntimeFactory.processAllMessages();

			// Concurrently edit, creating invalid insert.
			// Create delete. This will apply.
			const secondEditId = tree.editor.delete(firstNode);

			let thirdEditId;
			assertNoDelta(tree, () => {
				// concurrently insert next to the deleted node: this will become invalid.
				const secondNode = makeEmptyNode();
				thirdEditId = secondTree.editor.insert(secondNode, StablePlace.after(firstNode));
				containerRuntimeFactory.processAllMessages();
			});

			const leftTrait = secondTree.currentView.getTrait(leftTraitLocation);
			expect(leftTrait.length).to.equal(1);

			const editIds = tree.edits.editIds;

			// Edit 0 creates initial tree
			expect(editIds[1]).is.equal(firstEditId);
			expect(editIds[2]).is.equal(secondEditId);
			expect(editIds[3]).is.equal(thirdEditId);
		});

		it('tolerates invalid detaches', () => {
			const { tree, containerRuntimeFactory } = setUpTestSharedTree({ ...treeOptions });
			const { tree: secondTree } = setUpTestSharedTree({
				containerRuntimeFactory,
				...secondTreeOptions,
			});

			containerRuntimeFactory.processAllMessages();

			const firstNode = makeEmptyNode();
			const secondNode = makeEmptyNode();
			const thirdNode = makeEmptyNode();
			const firstEditId = secondTree.editor.insert([firstNode, secondNode, thirdNode], StablePlace.after(left));
			containerRuntimeFactory.processAllMessages();

			// Concurrently edit, creating invalid insert.
			// Create delete. This will apply.
			const secondEditId = tree.editor.delete(secondNode);

			let thirdEditId;
			assertNoDelta(tree, () => {
				// concurrently delete from before firstNode to after secondNode: this should become invalid
				thirdEditId = secondTree.editor.delete(
					StableRange.from(StablePlace.before(firstNode)).to(StablePlace.after(secondNode))
				);
			});

			containerRuntimeFactory.processAllMessages();

			// Expect that firstNode did not get deleted
			const leftTrait = tree.currentView.getTrait(leftTraitLocation);
			expect(leftTrait.length).to.equal(3);

			const editIds = tree.edits.editIds;
			// Edit 0 creates initial tree
			expect(editIds[1]).to.equal(firstEditId);
			expect(editIds[2]).to.equal(secondEditId);
			expect(editIds[3]).to.equal(thirdEditId);
		});

		it('tolerates malformed inserts', () => {
			const { tree, containerRuntimeFactory } = setUpTestSharedTree({ ...treeOptions });
			const { tree: secondTree } = setUpTestSharedTree({
				containerRuntimeFactory,
				...secondTreeOptions,
			});

			containerRuntimeFactory.processAllMessages();

			let edit;
			assertNoDelta(tree, () => {
				const build = Change.build([], 0 as DetachedSequenceId);
				edit = newEdit([build]);
				secondTree.processLocalEdit(edit);
				containerRuntimeFactory.processAllMessages();
			});

			// Edit 0 creates initial tree
			expect(tree.edits.getIdAtIndex(1)).to.equal(edit.id);
		});

		runSharedTreeUndoRedoTestSuite({ localMode: false, ...undoRedoOptions });

		// This is a regression test for documents corrupted by the following github issue:
		// https://github.com/microsoft/FluidFramework/issues/4399
		it('tolerates duplicate edits in trailing operations', () => {
			const { tree, containerRuntimeFactory } = setUpTestSharedTree({ ...treeOptions });
			const remoteRuntime = containerRuntimeFactory.createContainerRuntime(new MockFluidDataStoreRuntime());
			const defaultEdits = tree.edits.length;
			const edit = newEdit([]);
			for (let submissions = 0; submissions < 2; submissions++) {
				remoteRuntime.submit({ type: SharedTreeOpType.Edit, edit }, /* localOpMetadata */ undefined);
			}
			containerRuntimeFactory.processAllMessages();
			expect(tree.edits.length).to.equal(defaultEdits + 1);
		});
	});

	describe('SharedTree summarizing', () => {
		const treeOptions = { initialTree: simpleTestTree, localMode: false };
		const newNode = makeEmptyNode();
		const testHandle = new TestFluidHandle();

		it('returns false when given bad json input', () => {
			assert.typeOf(deserialize('', testSerializer), 'string');
			assert.typeOf(deserialize('~ malformed JSON ~', testSerializer), 'string');
			assert.typeOf(deserialize('{ unrecognizedKey: 42 }', testSerializer), 'string');
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
				const { tree, containerRuntimeFactory } = setUpTestSharedTree({
					initialTree: treeOptions.initialTree,
					localMode: hasLocalEdits,
				});

				tree.editor.insert(newNode, StablePlace.before(left));
				if (!hasLocalEdits) {
					containerRuntimeFactory.processAllMessages();
				}

				const serialized = serialize(tree.saveSummary(), testSerializer, testHandle);
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
			const { tree, containerRuntimeFactory } = setUpTestSharedTree(treeOptions);
			const { tree: secondTree } = setUpTestSharedTree();

			tree.editor.insert(newNode, StablePlace.before(left));
			containerRuntimeFactory.processAllMessages();

			secondTree.loadSummary(tree.saveSummary());

			// Trees should have equal state since we deserialized the first tree's state into the second tree
			expect(tree.equals(secondTree)).to.be.true;
		});

		it('can be used to initialize a tree with an empty edit list', () => {
			const { tree, containerRuntimeFactory } = setUpTestSharedTree(treeOptions);
			const { tree: secondTree } = setUpTestSharedTree();

			containerRuntimeFactory.processAllMessages();

			// The second tree is not caught up to the first tree yet
			expect(tree.equals(secondTree)).to.be.false;

			secondTree.loadSummary(tree.saveSummary());

			// Trees should have equal state since we deserialized the first tree's state into the second tree
			expect(tree.equals(secondTree)).to.be.true;
		});

		it('asserts when loading a summary with duplicated edits', () => {
			const { tree, containerRuntimeFactory } = setUpTestSharedTree(treeOptions);
			const { tree: secondTree } = setUpTestSharedTree();

			tree.editor.insert(newNode, StablePlace.before(left));
			containerRuntimeFactory.processAllMessages();
			tree.summarizer = fullHistorySummarizer;
			const summary = tree.saveSummary() as ReturnType<typeof fullHistorySummarizer>;
			const sequencedEdits = assertNotUndefined(summary.sequencedEdits).slice();
			sequencedEdits.push(sequencedEdits[0]);
			const corruptedSummary = {
				...summary,
				sequencedEdits,
			};
			expect(() => secondTree.loadSummary(corruptedSummary))
				.to.throw(Error)
				.that.has.property('message')
				.which.matches(/Duplicate/);
		});

		it('can be used without history preservation', async () => {
			const { tree } = setUpTestSharedTree({
				initialTree: simpleTestTree,
				localMode: true,
				summarizer: noHistorySummarizer,
			});

			const editID = tree.editor.insert(newNode, StablePlace.before(left));
			const view = tree.currentView;
			const summary = tree.saveSummary();

			tree.loadSummary(summary);

			// The current state of the tree should be identical to the one contained in the old summary.
			expect(tree.currentView.equals(view)).to.be.true;

			// The history should have been dropped by the default handling behavior.
			// It will contain a single entry setting the tree to equal the head revision.
			expect(tree.edits.length).to.equal(1);
			expect(await tree.edits.tryGetEdit(editID)).to.be.undefined;
		});

		// TODO:#49901: Enable these tests once we write edit chunk handles to summaries
		it.skip('does not swallow errors in asynchronous blob uploading', async () => {
			const errorMessage = 'Simulated exception in uploadBlob';
			const { tree, componentRuntime, containerRuntimeFactory } = setUpTestSharedTree(treeOptions);
			componentRuntime.uploadBlob = async () => {
				throw new Error(errorMessage);
			};

			let treeErrorEventWasInvoked = false;
			tree.on('error', (error: unknown) => {
				treeErrorEventWasInvoked = true;
				expect(error).to.have.property('message').which.equals(errorMessage);
			});

			// Generate enough edits to cause a chunk upload.
			for (let i = 0; i < editsPerChunk / 2 + 1; i++) {
				const insertee = makeEmptyNode();
				tree.editor.insert(insertee, StablePlace.before(left));
				tree.editor.delete(StableRange.only(insertee));
			}

			containerRuntimeFactory.processAllMessages();
			tree.saveSummary();

			// Just waiting for the ChunksEmitted event here isn't sufficient, as the SharedTree error
			// will propagate in a separate promise chain.
			await delay(0);
			expect(treeErrorEventWasInvoked).to.equal(true, 'SharedTree error was never raised');
		});
	});

	describe('correctly diffs snapshots', () => {
		it('that are the same object', () => {
			const id = uuidv4() as NodeId;
			const snapshot = Snapshot.fromTree(makeEmptyNode(id));
			expect(snapshot.delta(snapshot)).deep.equals({
				changed: [],
				added: [],
				removed: [],
			});
		});

		it('that have the same tree', () => {
			const node = makeEmptyNode();
			const snapshotA = Snapshot.fromTree(node);
			const snapshotB = Snapshot.fromTree(node);
			expect(snapshotA.delta(snapshotB)).deep.equals({
				changed: [],
				added: [],
				removed: [],
			});
		});

		it('with different root ids', () => {
			const snapshotA = Snapshot.fromTree(makeEmptyNode());
			const snapshotB = Snapshot.fromTree(makeEmptyNode());
			expect(() => snapshotA.delta(snapshotB)).to.throw(
				'Delta can only be calculated between snapshots that share a root'
			);
		});

		it('with different subtrees', () => {
			const rootId = uuidv4() as NodeId;
			const subtreeA = uuidv4() as NodeId;
			const subtreeB = uuidv4() as NodeId;
			const leafA = makeEmptyNode();
			const leafB = makeEmptyNode();
			const rootA: ChangeNode = {
				identifier: rootId,
				definition: 'node' as Definition,
				traits: {
					children: [
						{
							identifier: subtreeA,
							definition: 'node' as Definition,
							traits: { children: [leafA] },
						},
					],
				},
			};
			const rootB: ChangeNode = {
				identifier: rootId,
				definition: 'node' as Definition,
				traits: {
					children: [
						{
							identifier: subtreeB,
							definition: 'node' as Definition,
							traits: { children: [leafB] },
						},
					],
				},
			};

			const snapshotA = Snapshot.fromTree(rootA);
			const snapshotB = Snapshot.fromTree(rootB);
			const delta = snapshotA.delta(snapshotB);
			expect(delta.changed).deep.equals([rootId]);
			expect(delta.removed.length).equals(2);
			expect(delta.added.length).equals(2);
			expect(delta.removed).contains(subtreeA);
			expect(delta.removed).contains(leafA.identifier);
			expect(delta.added).contains(subtreeB);
			expect(delta.added).contains(leafB.identifier);
		});

		it('with different payloads', () => {
			const rootId = uuidv4() as NodeId;
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

			const snapshotA = Snapshot.fromTree(nodeA);
			const snapshotB = Snapshot.fromTree(nodeB);
			const delta = snapshotA.delta(snapshotB);
			expect(delta.changed).deep.equals([rootId]);
			expect(delta.removed).deep.equals([]);
			expect(delta.added).deep.equals([]);
		});

		it('after an insert', () => {
			const { tree } = setUpTestSharedTree({ initialTree: simpleTestTree });

			const snapshotA = tree.currentView;
			const insertedNode = makeEmptyNode();
			tree.editor.insert(insertedNode, StablePlace.before(left));
			const snapshotB = tree.currentView;
			const delta = snapshotA.delta(snapshotB);
			assert(delta);
			expect(delta.changed).deep.equals([simpleTestTree.identifier]);
			expect(delta.removed).deep.equals([]);
			expect(delta.added).deep.equals([insertedNode.identifier]);
		});

		it('after a delete', () => {
			const { tree } = setUpTestSharedTree({ initialTree: simpleTestTree });

			const snapshotA = tree.currentView;
			tree.editor.delete(left);
			const snapshotB = tree.currentView;
			const delta = snapshotA.delta(snapshotB);
			assert(delta);
			expect(delta.changed).deep.equals([simpleTestTree.identifier]);
			expect(delta.removed).deep.equals([left.identifier]);
			expect(delta.added).deep.equals([]);
		});

		it('after a move', () => {
			const { tree } = setUpTestSharedTree({ initialTree: simpleTestTree });

			const snapshotA = tree.currentView;
			tree.editor.move(left, StablePlace.after(right));
			const snapshotB = tree.currentView;
			const delta = snapshotA.delta(snapshotB);
			assert(delta);
			expect(delta.changed).deep.equals([simpleTestTree.identifier]);
			expect(delta.removed).deep.equals([]);
			expect(delta.added).deep.equals([]);
		});
	});

	describe('handles', () => {
		it('can reference a node', () => {
			// Test that a handle can wrap a node and retrieve that node's properties
			const { tree } = setUpTestSharedTree({ initialTree: simpleTestTree });
			const leftHandle = new TreeNodeHandle(tree.currentView, left.identifier);
			expect(areNodesEquivalent(left, leftHandle)).to.be.true;
			expect(areNodesEquivalent(right, leftHandle)).to.be.false;
		});

		it('can create handles from children', () => {
			// Test that when retrieving children via the "traits" property of a handle, the
			// children are also wrapped in handles
			const { tree } = setUpTestSharedTree({ initialTree: simpleTestTree });
			const rootHandle = new TreeNodeHandle(tree.currentView, simpleTestTree.identifier);
			expect(areNodesEquivalent(simpleTestTree, rootHandle)).to.be.true;
			const leftHandle = rootHandle.traits.left[0];
			expect(areNodesEquivalent(left, leftHandle)).to.be.true;
			expect(leftHandle instanceof TreeNodeHandle).to.be.true;
		});

		it('do not update when the current view of the tree changes', () => {
			// Unlike CurrentTreeNodeHandles, SnapshotTreeNodeHandles should never change
			const { tree } = setUpTestSharedTree({ initialTree: simpleTestTree });
			const leftHandle = new TreeNodeHandle(tree.currentView, left.identifier);
			expect(leftHandle.traits.right).to.be.undefined;
			// Move "right" under "left"
			tree.editor.move(right, StablePlace.atStartOf({ parent: left.identifier, label: rightTraitLabel }));
			expect(leftHandle.traits.right).to.be.undefined;
		});

		it('can be fully demanded', () => {
			const { tree } = setUpTestSharedTree({ initialTree: simpleTestTree });
			const rootHandle = new TreeNodeHandle(tree.currentView, simpleTestTree.identifier);
			const rootNode = rootHandle.demandTree();
			expect(areNodesEquivalent(simpleTestTree, rootNode)).to.be.true;
			const printBeforeDemand = JSON.stringify(rootNode);
			// Demand the tree by walking into its traits. If they were lazy, this would change the `rootNode` object.
			expect(areNodesEquivalent(left, rootNode.traits.left[0])).to.be.true;
			expect(areNodesEquivalent(right, rootNode.traits.right[0])).to.be.true;
			// Ensure that they were _not_ lazy by comparing with the initial print of the tree
			expect(JSON.stringify(rootNode)).equals(printBeforeDemand);
		});

		it('implement toString', () => {
			const { tree } = setUpTestSharedTree({ initialTree: simpleTestTree });
			const rootHandle = new TreeNodeHandle(tree.currentView, simpleTestTree.identifier);
			const print = `${rootHandle}`;
			// Shouldn't print the default toString for objects
			expect(print.startsWith('[object')).to.be.false;
		});
	});

	describe('telemetry', () => {
		it('decorates events with the correct properties', async () => {
			// Test that a handle can wrap a node and retrieve that node's properties
			const events: ITelemetryBaseEvent[] = [];
			const { tree, containerRuntimeFactory } = setUpTestSharedTree({
				initialTree: simpleTestTree,
				logger: { send: (event) => events.push(event) },
			});
			// Invalid edit
			tree.editor.insert(makeEmptyNode(), StablePlace.after(makeEmptyNode()));
			containerRuntimeFactory.processAllMessages();
			// Force demand, which will cause a telemetry event for the invalid edit to be emitted
			await tree.logViewer.getSnapshot(Number.POSITIVE_INFINITY);
			expect(events.length).is.greaterThan(0);
			events.forEach((event) => {
				expect(isSharedTreeEvent(event)).is.true;
			});
		});
	});
});
