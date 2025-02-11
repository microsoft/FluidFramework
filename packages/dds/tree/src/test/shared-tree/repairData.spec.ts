/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";

import { rootFieldKey } from "../../core/index.js";
import { StringArray, TestTreeProviderLite, createTestUndoRedoStacks } from "../utils.js";
import { TreeStatus } from "../../feature-libraries/index.js";
import { TestAnchor } from "../testAnchor.js";
import { TreeViewConfiguration } from "../../simple-tree/index.js";

const enableSchemaValidation = true;

describe("Repair Data", () => {
	describe("is destroyed when", () => {
		it("the collab window progresses far enough", () => {
			const provider = new TestTreeProviderLite(2);
			const view1 = provider.trees[0].viewWith(
				new TreeViewConfiguration({
					schema: StringArray,
					enableSchemaValidation,
				}),
			);
			view1.initialize(["A", "B", "C", "D"]);

			// make sure that revertibles are created
			const { unsubscribe } = createTestUndoRedoStacks(view1.checkout.events);

			provider.processMessages();
			const view2 = provider.trees[1].viewWith(
				new TreeViewConfiguration({
					schema: StringArray,
					enableSchemaValidation,
				}),
			);

			// get anchors on the peer to the nodes we're removing
			const anchorAOnTree2 = TestAnchor.fromValue(view2.checkout.forest, "A");
			const anchorBOnTree2 = TestAnchor.fromValue(view2.checkout.forest, "B");

			// remove in first tree
			view1.root.removeRange(0, 2);

			provider.processMessages();
			const removeSequenceNumber = provider.sequenceNumber;
			assert.deepEqual([...view1.root], ["C", "D"]);
			assert.deepEqual([...view2.root], ["C", "D"]);
			assert.equal(view2.checkout.getRemovedRoots().length, 2);

			// check the detached field on the peer
			assert.equal(anchorAOnTree2.treeStatus, TreeStatus.Removed);
			assert.equal(anchorBOnTree2.treeStatus, TreeStatus.Removed);

			advanceCollabWindow(provider, removeSequenceNumber);

			assert.deepEqual([...view1.root], ["C", "D"]);
			assert.deepEqual([...view2.root], ["C", "D"]);

			// check that the repair data on the peer is destroyed
			assert.equal(anchorAOnTree2.treeStatus, TreeStatus.Deleted);
			assert.equal(anchorBOnTree2.treeStatus, TreeStatus.Deleted);

			assert.equal(view2.checkout.getRemovedRoots().length, 0);

			unsubscribe();
		});

		it("the collab window progresses far enough after a rebase", () => {
			const provider = new TestTreeProviderLite(2);
			const view1 = provider.trees[0].viewWith(
				new TreeViewConfiguration({
					schema: StringArray,
					enableSchemaValidation,
				}),
			);
			view1.initialize(["A", "B", "C", "D"]);

			provider.processMessages();
			const view2 = provider.trees[1].viewWith(
				new TreeViewConfiguration({
					schema: StringArray,
					enableSchemaValidation,
				}),
			);

			view1.root.insertAt(1, "x");
			assert.deepEqual([...view1.root], ["A", "x", "B", "C", "D"]);

			// get an anchor on the peer to the node we're removing
			const anchorCOnview2 = TestAnchor.fromValue(view2.checkout.forest, "C");

			view2.root.removeAt(2);
			assert.deepEqual([...view2.root], ["A", "B", "D"]);

			// Syncing will cause view2 to rebase its local changes
			provider.processMessages();

			const removeSequenceNumber = provider.sequenceNumber;
			assert.deepEqual([...view1.root], ["A", "x", "B", "D"]);
			assert.deepEqual([...view2.root], ["A", "x", "B", "D"]);
			assert.equal(view2.checkout.getRemovedRoots().length, 1);

			// check the detached field on the peer
			assert.equal(anchorCOnview2.treeStatus, TreeStatus.Removed);

			advanceCollabWindow(provider, removeSequenceNumber);

			assert.deepEqual([...view1.root], ["A", "x", "B", "D"]);
			assert.deepEqual([...view2.root], ["A", "x", "B", "D"]);

			// check that the repair data on the peer is destroyed
			assert.equal(anchorCOnview2.treeStatus, TreeStatus.Deleted);
		});

		it("the corresponding revertible is disposed", () => {
			const provider = new TestTreeProviderLite(1);
			const view1 = provider.trees[0].viewWith(
				new TreeViewConfiguration({
					schema: StringArray,
					enableSchemaValidation,
				}),
			);
			view1.initialize(["A", "B", "C", "D"]);

			// make sure that revertibles are created
			const { undoStack, unsubscribe } = createTestUndoRedoStacks(view1.checkout.events);

			// get anchors to the nodes we're removing
			const anchorAOnTree1 = TestAnchor.fromValue(view1.checkout.forest, "A");
			const anchorBOnTree1 = TestAnchor.fromValue(view1.checkout.forest, "B");

			// remove in first tree
			view1.root.removeRange(0, 2);
			provider.processMessages();
			const removeSequenceNumber = provider.sequenceNumber;

			assert.deepEqual([...view1.root], ["C", "D"]);

			advanceCollabWindow(provider, removeSequenceNumber);

			// The nodes should not have been deleted yet because the revertible is still active
			assert.equal(anchorAOnTree1.treeStatus, TreeStatus.Removed);
			assert.equal(anchorBOnTree1.treeStatus, TreeStatus.Removed);
			assert.equal(view1.checkout.getRemovedRoots().length, 2);

			// dispose the revertible
			undoStack[0].dispose();

			// check that the repair data on the first tree is destroyed
			assert.equal(anchorAOnTree1.treeStatus, TreeStatus.Deleted);
			assert.equal(anchorBOnTree1.treeStatus, TreeStatus.Deleted);
			assert.equal(view1.checkout.getRemovedRoots().length, 0);

			unsubscribe();
		});

		it("the corresponding revertible is disposed with grouped batching", () => {
			const provider = new TestTreeProviderLite(
				1,
				undefined /* factory */,
				undefined /* useDeterministicSessionIds */,
				FlushMode.TurnBased,
			);
			const tree1 = provider.trees[0];
			const view1 = tree1.viewWith(
				new TreeViewConfiguration({
					schema: StringArray,
					enableSchemaValidation,
				}),
			);
			view1.initialize(["A", "B"]);

			// make sure that revertibles are created
			const { undoStack, unsubscribe } = createTestUndoRedoStacks(view1.checkout.events);

			// get anchors to the nodes we're removing
			const anchorAOnTree1 = TestAnchor.fromValue(view1.checkout.forest, "A");

			// remove in first tree
			view1.root.removeRange(0, 1);

			provider.processMessages();
			const removeSequenceNumber = provider.sequenceNumber;

			assert.deepEqual([...view1.root], ["B"]);

			advanceCollabWindow(provider, removeSequenceNumber);

			// The nodes should not have been deleted yet because the revertible is still active
			assert.equal(anchorAOnTree1.treeStatus, TreeStatus.Removed);
			assert.equal(view1.checkout.getRemovedRoots().length, 1);

			// dispose the revertible
			undoStack[0].dispose();

			// check that the repair data on the first tree is destroyed
			assert.equal(anchorAOnTree1.treeStatus, TreeStatus.Deleted);
			assert.equal(view1.checkout.getRemovedRoots().length, 0);

			unsubscribe();
		});

		it("created in a transaction with an aborted nested transaction", () => {
			const provider = new TestTreeProviderLite(1);
			const view1 = provider.trees[0].viewWith(
				new TreeViewConfiguration({
					schema: StringArray,
					enableSchemaValidation,
				}),
			);
			view1.initialize(["A", "B", "C", "D"]);

			// get an anchor on the peer to the node we're removing
			const anchorA = TestAnchor.fromValue(view1.checkout.forest, "A");
			const anchorB = TestAnchor.fromValue(view1.checkout.forest, "B");

			// remove in first tree in a transaction
			view1.checkout.transaction.start();
			view1.root.removeAt(0);
			view1.checkout.transaction.start();
			view1.root.removeAt(0);
			assert.equal(anchorA.treeStatus, TreeStatus.Removed);
			assert.equal(anchorB.treeStatus, TreeStatus.Removed);

			view1.checkout.transaction.abort();
			view1.checkout.transaction.commit();

			assert.equal(anchorA.treeStatus, TreeStatus.Removed);
			assert.equal(anchorB.treeStatus, TreeStatus.InDocument);

			provider.processMessages();
			const removeSequenceNumber = provider.sequenceNumber;
			assert.deepEqual([...view1.root], ["B", "C", "D"]);
			assert.equal(view1.checkout.getRemovedRoots().length, 1);

			advanceCollabWindow(provider, removeSequenceNumber);

			assert.deepEqual([...view1.root], ["B", "C", "D"]);

			assert.equal(anchorA.treeStatus, TreeStatus.Deleted);
			assert.equal(anchorB.treeStatus, TreeStatus.InDocument);
			assert.equal(view1.checkout.getRemovedRoots().length, 0);
		});
	});

	describe("is not destroyed when", () => {
		it("still relevant due to branches", () => {
			const provider = new TestTreeProviderLite(2);
			const view1 = provider.trees[0].viewWith(
				new TreeViewConfiguration({
					schema: StringArray,
					enableSchemaValidation,
				}),
			);
			view1.initialize(["A", "B", "C", "D"]);

			provider.processMessages();
			const view2 = provider.trees[1].viewWith(
				new TreeViewConfiguration({
					schema: StringArray,
					enableSchemaValidation,
				}),
			);

			// create a fork before the creation of the repair data
			const _ = view2.checkout.branch();

			// get an anchor on the peer to the node we're removing
			const anchorAOnTree2 = TestAnchor.fromValue(view2.checkout.forest, "A");

			// remove in first tree
			view1.root.removeAt(0);

			provider.processMessages();
			const removeSequenceNumber = provider.sequenceNumber;
			assert.deepEqual([...view1.root], ["B", "C", "D"]);
			assert.deepEqual([...view2.root], ["B", "C", "D"]);

			// check the detached field on the peer
			assert.equal(anchorAOnTree2.treeStatus, TreeStatus.Removed);
			assert.equal(view2.checkout.getRemovedRoots().length, 1);

			advanceCollabWindow(provider, removeSequenceNumber);

			assert.deepEqual([...view1.root], ["B", "C", "D"]);
			assert.deepEqual([...view2.root], ["B", "C", "D"]);

			// check that the repair data on the peer is not destroyed
			assert.equal(anchorAOnTree2.treeStatus, TreeStatus.Removed);
			assert.equal(view2.checkout.getRemovedRoots().length, 1);
		});

		it("still relevant due to revertibles", () => {
			const provider = new TestTreeProviderLite(2);
			const view1 = provider.trees[0].viewWith(
				new TreeViewConfiguration({
					schema: StringArray,
					enableSchemaValidation,
				}),
			);
			view1.initialize(["A", "B", "C", "D"]);

			// make sure that revertibles are created
			const { unsubscribe } = createTestUndoRedoStacks(view1.checkout.events);

			provider.processMessages();
			const view2 = provider.trees[1].viewWith(
				new TreeViewConfiguration({
					schema: StringArray,
					enableSchemaValidation,
				}),
			);

			// get an anchor to the node we're removing
			const anchorAOnTree1 = TestAnchor.fromValue(view1.checkout.forest, "A");

			// get an anchor on the peer to the node we're removing
			const anchorAOnTree2 = TestAnchor.fromValue(view2.checkout.forest, "A");

			// remove in first tree
			view1.root.removeAt(0);

			provider.processMessages();
			const removeSequenceNumber = provider.sequenceNumber;
			assert.deepEqual([...view1.root], ["B", "C", "D"]);
			assert.deepEqual([...view2.root], ["B", "C", "D"]);

			// check the detached field on the first tree
			assert.equal(anchorAOnTree1.treeStatus, TreeStatus.Removed);
			assert.equal(view1.checkout.getRemovedRoots().length, 1);

			advanceCollabWindow(provider, removeSequenceNumber);

			assert.deepEqual([...view1.root], ["B", "C", "D"]);
			assert.deepEqual([...view2.root], ["B", "C", "D"]);

			// check that the repair data on the first tree is not destroyed
			assert.equal(anchorAOnTree1.treeStatus, TreeStatus.Removed);
			assert.equal(view1.checkout.getRemovedRoots().length, 1);

			// check that the repair data on the second tree is destroyed
			assert.equal(anchorAOnTree2.treeStatus, TreeStatus.Deleted);
			assert.equal(view2.checkout.getRemovedRoots().length, 0);

			unsubscribe();
		});
	});
});

function advanceCollabWindow(provider: TestTreeProviderLite, removeSequenceNumber: number) {
	provider.processMessages();
	while (provider.minimumSequenceNumber <= removeSequenceNumber) {
		for (const tree of provider.trees) {
			tree.editor.enterTransaction();
			tree.editor.addNodeExistsConstraint({
				parent: undefined,
				parentField: rootFieldKey,
				parentIndex: 0,
			});
			tree.editor.exitTransaction();
			provider.processMessages();
		}
	}
}
