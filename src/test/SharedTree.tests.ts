/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, expect } from 'chai';
import { v4 as uuidv4 } from 'uuid';
import { assertArrayOfOne } from '../Common';
import { Definition, DetachedSequenceId, NodeId, TraitLabel } from '../Identifiers';
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
	setUpEventOrderTesting,
} from './utilities/TestUtilities';
import { SharedTreeEvent } from '../SharedTree';
import { Change, ChangeType, EditNode, Delete, Insert, ChangeNode, StablePlace, StableRange } from '../PersistedTypes';
import { deepCompareNodes, newEdit } from '../EditUtilities';
import { runSharedTreeUndoRedoTestSuite } from './utilities/UndoRedoTests';
import { deserialize, noHistorySummarizer, serialize, SharedTreeSummary } from '../Summary';
import { Snapshot } from '../Snapshot';
import { initialTree } from '../InitialTree';

describe('SharedTree', () => {
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

			tree.applyEdit(buildChild, buildParent, buildParent2);
			tree.currentView; // force computing of currentView
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
			const { tree } = setUpTestSharedTree({ initialTree: simpleTestTree, allowInvalid: true });

			const firstNode = makeEmptyNode();
			const secondNode = makeEmptyNode();

			const expectedEventStack: SharedTreeEvent[] = [
				SharedTreeEvent.DroppedInvalidEdit,
				SharedTreeEvent.AppliedEdit,
				SharedTreeEvent.AppliedEdit,
			];

			setUpEventOrderTesting(tree, expectedEventStack);

			tree.editor.insert(firstNode, StablePlace.after(left));
			tree.editor.delete(firstNode);

			// Trying to insert next to the deleted node should drop
			tree.processLocalEdit(newEdit(Insert.create([secondNode], StablePlace.after(firstNode))));

			tree.currentView; // force computing of currentView
			expect(expectedEventStack).deep.equals([]);

			const leftTrait = tree.currentView.getTrait(leftTraitLocation);
			expect(leftTrait.length).to.equal(1);
		});

		it('tolerates invalid detaches', () => {
			const { tree } = setUpTestSharedTree({ initialTree: simpleTestTree, allowInvalid: true });

			const firstNode = makeEmptyNode();
			const secondNode = makeEmptyNode();
			const thirdNode = makeEmptyNode();

			const expectedEventStack: SharedTreeEvent[] = [
				SharedTreeEvent.DroppedInvalidEdit,
				SharedTreeEvent.DroppedInvalidEdit,
				SharedTreeEvent.AppliedEdit,
				SharedTreeEvent.AppliedEdit,
			];

			setUpEventOrderTesting(tree, expectedEventStack);

			tree.editor.insert([firstNode, secondNode, thirdNode], StablePlace.after(left));
			tree.editor.delete(secondNode);

			// Trying to delete from before firstNode to after secondNode should drop
			tree.processLocalEdit(
				newEdit([
					Delete.create(StableRange.from(StablePlace.before(firstNode)).to(StablePlace.after(secondNode))),
				])
			);

			// Trying to delete from after thirdNode to before firstNode should drop
			tree.processLocalEdit(
				newEdit([
					Delete.create(StableRange.from(StablePlace.after(thirdNode)).to(StablePlace.before(firstNode))),
				])
			);

			tree.currentView; // force computing of currentView
			expect(expectedEventStack).deep.equals([]);

			// Expect that firstNode did not get deleted
			const leftTrait = tree.currentView.getTrait(leftTraitLocation);
			expect(leftTrait.length).to.equal(3);
		});

		it('tolerates malformed inserts', () => {
			const { tree } = setUpTestSharedTree({ initialTree: simpleTestTree, allowMalformed: true });

			const expectedEventStack: SharedTreeEvent[] = [SharedTreeEvent.DroppedMalformedEdit];

			setUpEventOrderTesting(tree, expectedEventStack);

			tree.processLocalEdit(newEdit([Change.build([], 0 as DetachedSequenceId)]));

			tree.currentView; // force computing of currentView
			expect(expectedEventStack).deep.equals([]);
		});

		runSharedTreeUndoRedoTestSuite({ localMode: true });
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
			const { tree, containerRuntimeFactory } = setUpTestSharedTree({ ...treeOptions, allowInvalid: true });
			const { tree: secondTree } = setUpTestSharedTree({
				containerRuntimeFactory,
				...secondTreeOptions,
				allowInvalid: true,
			});

			containerRuntimeFactory.processAllMessages();

			const expectedEventStack: SharedTreeEvent[] = [
				SharedTreeEvent.DroppedInvalidEdit,
				SharedTreeEvent.AppliedEdit,
				SharedTreeEvent.AppliedEdit,
			];

			setUpEventOrderTesting(tree, expectedEventStack);

			const firstNode = makeEmptyNode();
			const firstEditId = secondTree.editor.insert(firstNode, StablePlace.after(left));
			containerRuntimeFactory.processAllMessages();

			// Concurrently edit, creating invalid insert.
			// Create delete. This will apply.
			const secondEditId = tree.editor.delete(firstNode);

			// concurrently insert next to the deleted node: this will become invalid.
			const secondNode = makeEmptyNode();
			const thirdEditId = secondTree.editor.insert(secondNode, StablePlace.after(firstNode));
			containerRuntimeFactory.processAllMessages();
			tree.currentView; // force computing of currentView
			expect(expectedEventStack).deep.equals([]);

			const leftTrait = secondTree.currentView.getTrait(leftTraitLocation);
			expect(leftTrait.length).to.equal(1);

			const edits = Array.from(tree.edits);

			// Edit 0 creates initial tree
			expect(edits[1].id).is.equal(firstEditId);
			expect(edits[2].id).is.equal(secondEditId);
			expect(edits[3].id).is.equal(thirdEditId);
		});

		it('tolerates invalid detaches', () => {
			const { tree, containerRuntimeFactory } = setUpTestSharedTree({ ...treeOptions, allowInvalid: true });
			const { tree: secondTree } = setUpTestSharedTree({
				containerRuntimeFactory,
				...secondTreeOptions,
				allowInvalid: true,
			});

			containerRuntimeFactory.processAllMessages();

			const expectedEventStack: SharedTreeEvent[] = [
				SharedTreeEvent.DroppedInvalidEdit,
				SharedTreeEvent.AppliedEdit,
				SharedTreeEvent.AppliedEdit,
			];

			setUpEventOrderTesting(tree, expectedEventStack);

			const firstNode = makeEmptyNode();
			const secondNode = makeEmptyNode();
			const thirdNode = makeEmptyNode();
			const firstEditId = secondTree.editor.insert([firstNode, secondNode, thirdNode], StablePlace.after(left));
			containerRuntimeFactory.processAllMessages();

			// Concurrently edit, creating invalid insert.
			// Create delete. This will apply.
			const secondEditId = tree.editor.delete(secondNode);

			// concurrently delete from before firstNode to after secondNode: this should become invalid
			const thirdEditId = secondTree.editor.delete(
				StableRange.from(StablePlace.before(firstNode)).to(StablePlace.after(secondNode))
			);

			containerRuntimeFactory.processAllMessages();
			tree.currentView; // force computing of currentView
			expect(expectedEventStack).deep.equals([]);

			// Expect that firstNode did not get deleted
			const leftTrait = tree.currentView.getTrait(leftTraitLocation);
			expect(leftTrait.length).to.equal(3);

			const edits = Array.from(tree.edits);
			// Edit 0 creates initial tree
			expect(edits[1].id).to.equal(firstEditId);
			expect(edits[2].id).to.equal(secondEditId);
			expect(edits[3].id).to.equal(thirdEditId);
		});

		it('tolerates malformed inserts', () => {
			const { tree, containerRuntimeFactory } = setUpTestSharedTree({ ...treeOptions, allowMalformed: true });
			const { tree: secondTree } = setUpTestSharedTree({
				containerRuntimeFactory,
				...secondTreeOptions,
				allowMalformed: true,
			});

			containerRuntimeFactory.processAllMessages();

			const expectedEventStack: SharedTreeEvent[] = [SharedTreeEvent.DroppedMalformedEdit];

			setUpEventOrderTesting(tree, expectedEventStack);

			const build = Change.build([], 0 as DetachedSequenceId);
			const edit = newEdit([build]);
			secondTree.processLocalEdit(edit);
			containerRuntimeFactory.processAllMessages();
			tree.currentView; // force computing of currentView
			expect(expectedEventStack).deep.equals([]);

			const edits = Array.from(tree.edits);
			// Edit 0 creates initial tree
			expect(edits[1].id).to.equal(edit.id);
		});

		runSharedTreeUndoRedoTestSuite({ localMode: false });
	});

	describe('SharedTree summarizing', () => {
		const treeOptions = { initialTree: simpleTestTree, localMode: false };
		const newNode = makeEmptyNode();

		it('returns false when given bad json input', () => {
			assert.typeOf(deserialize(''), 'string');
			assert.typeOf(deserialize('~ malformed JSON ~'), 'string');
			assert.typeOf(deserialize('{ unrecognizedKey: 42 }'), 'string');
		});

		it('correctly handles snapshots of default trees', () => {
			const { tree: uninitializedTree } = setUpTestSharedTree();

			// Serialize the state of one uninitialized tree into a second tree
			const serialized = serialize(uninitializedTree.saveSummary());
			const parsedTree = deserialize(serialized) as SharedTreeSummary;
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

				const serialized = serialize(tree.saveSummary());
				const treeContent = JSON.parse(serialized);
				const parsedTree = treeContent as SharedTreeSummary;

				expect(parsedTree.currentTree).to.not.be.undefined;
				const testRoot = assertArrayOfOne(parsedTree.currentTree.traits[testTrait.label]);
				expect(testRoot).to.not.be.undefined;
				expect(testRoot.traits.left).to.not.be.undefined;
				expect(testRoot.traits.right).to.not.be.undefined;
				expect(testRoot.traits.left.length).to.equal(2);

				// Expect there to be a change in the edit history in addition to the one from setUpTestSharedTree
				expect(parsedTree.sequencedEdits.length).to.equal(2);
				// The first operation to be sequenced is the tree init
				expect(parsedTree.sequencedEdits[1].changes.length).to.equal(2);
				expect(parsedTree.sequencedEdits[1].changes[0].type).to.equal(ChangeType.Build);
				expect(parsedTree.sequencedEdits[1].changes[1].type).to.equal(ChangeType.Insert);
			});
		});

		it('can be used to initialize a tree', () => {
			const { tree, containerRuntimeFactory } = setUpTestSharedTree(treeOptions);
			const { tree: secondTree } = setUpTestSharedTree();

			tree.editor.insert(newNode, StablePlace.before(left));
			containerRuntimeFactory.processAllMessages();

			const serialized = serialize(tree.saveSummary());

			// The second tree is not caught up to the first tree yet
			expect(tree.equals(secondTree)).to.be.false;

			const summary = deserialize(serialized);
			assert.typeOf(summary, 'object');
			secondTree.loadSummary(summary as SharedTreeSummary);

			// Trees should have equal state since we deserialized the first tree's state into the second tree
			expect(tree.equals(secondTree)).to.be.true;
		});

		it('can be used to initialize a tree with an empty edit list', () => {
			const { tree, containerRuntimeFactory } = setUpTestSharedTree(treeOptions);
			const { tree: secondTree } = setUpTestSharedTree();

			containerRuntimeFactory.processAllMessages();

			const serialized = serialize(tree.saveSummary());

			// The second tree is not caught up to the first tree yet
			expect(tree.equals(secondTree)).to.be.false;

			const summary = deserialize(serialized);
			assert.typeOf(summary, 'object');
			secondTree.loadSummary(summary as SharedTreeSummary);

			// Trees should have equal state since we deserialized the first tree's state into the second tree
			expect(tree.equals(secondTree)).to.be.true;
		});

		it('can be used without history preservation', () => {
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
			expect(tree.edits.tryGetEdit(editID)).to.be.undefined;
		});
	});

	describe('correctly diffs snapshots', () => {
		it('that are the same object', () => {
			const id = uuidv4() as NodeId;
			const snapshot = Snapshot.fromTree(makeEmptyNode(id));
			expect(snapshot.delta(snapshot)).to.be.empty;
		});

		it('that have the same tree', () => {
			const node = makeEmptyNode();
			const snapshotA = Snapshot.fromTree(node);
			const snapshotB = Snapshot.fromTree(node);
			expect(snapshotA.delta(snapshotB)).to.be.empty;
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
			const childA = makeEmptyNode();
			const childB = makeEmptyNode();
			const rootA: ChangeNode = {
				identifier: rootId,
				definition: 'node' as Definition,
				traits: { children: [childA] },
			};
			const rootB: ChangeNode = {
				identifier: rootId,
				definition: 'node' as Definition,
				traits: { children: [childB] },
			};

			const snapshotA = Snapshot.fromTree(rootA);
			const snapshotB = Snapshot.fromTree(rootB);
			const delta = snapshotA.delta(snapshotB);
			expect(delta.length).to.equal(1);
			expect(delta[0]).to.equal(rootId);
		});

		it('with different payloads', () => {
			const rootId = uuidv4() as NodeId;
			const nodeA: ChangeNode = {
				identifier: rootId,
				definition: 'node' as Definition,
				payload: { base64: 'pardesio' },
				traits: {},
			};
			const nodeB: ChangeNode = {
				identifier: rootId,
				definition: 'node' as Definition,
				payload: { base64: 'hortonio' },
				traits: {},
			};

			const snapshotA = Snapshot.fromTree(nodeA);
			const snapshotB = Snapshot.fromTree(nodeB);
			const delta = snapshotA.delta(snapshotB);
			expect(delta.length).to.equal(1);
			expect(delta[0]).to.equal(rootId);
		});

		it('after an insert', () => {
			const { tree } = setUpTestSharedTree({ initialTree: simpleTestTree });

			const snapshotA = tree.currentView;
			tree.editor.insert(makeEmptyNode(), StablePlace.before(left));
			const snapshotB = tree.currentView;
			const delta = snapshotA.delta(snapshotB);
			assert(delta);
			expect(delta.length).to.equal(1);
			expect(delta[0]).to.equal(simpleTestTree.identifier);
		});

		it('after a delete', () => {
			const { tree } = setUpTestSharedTree({ initialTree: simpleTestTree });

			const snapshotA = tree.currentView;
			tree.editor.delete(left);
			const snapshotB = tree.currentView;
			const delta = snapshotA.delta(snapshotB);
			assert(delta);
			expect(delta.length).to.equal(1);
			expect(delta[0]).to.equal(simpleTestTree.identifier);
		});
	});
});
