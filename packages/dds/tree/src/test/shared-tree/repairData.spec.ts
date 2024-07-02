/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { AllowedUpdateType } from "../../core/index.js";
import type { InitializeAndSchematizeConfiguration } from "../../shared-tree/index.js";
import {
	TestTreeProviderLite,
	createTestUndoRedoStacks,
	schematizeFlexTree,
	stringSequenceRootSchema,
} from "../utils.js";
import { TreeStatus } from "../../feature-libraries/index.js";
import { TestAnchor } from "../testAnchor.js";

describe("Repair Data", () => {
	describe("is destroyed when", () => {
		it("the collab window progresses far enough", () => {
			const provider = new TestTreeProviderLite(2);
			const content = {
				schema: stringSequenceRootSchema,
				allowedSchemaModifications: AllowedUpdateType.Initialize,
				initialTree: ["A", "B", "C", "D"],
			} satisfies InitializeAndSchematizeConfiguration;
			const tree1 = schematizeFlexTree(provider.trees[0], content);

			// make sure that revertibles are created
			const { unsubscribe } = createTestUndoRedoStacks(tree1.checkout.events);

			provider.processMessages();
			const tree2 = schematizeFlexTree(provider.trees[1], content);

			const root1 = tree1.flexTree;
			const root2 = tree2.flexTree;

			// get anchors on the peer to the nodes we're removing
			const anchorAOnTree2 = TestAnchor.fromValue(tree2.checkout.forest, "A");
			const anchorBOnTree2 = TestAnchor.fromValue(tree2.checkout.forest, "B");

			// remove in first tree
			root1.sequenceEditor().remove(0, 2);

			provider.processMessages();
			const removeSequenceNumber = provider.sequenceNumber;
			assert.deepEqual([...root1], ["C", "D"]);
			assert.deepEqual([...root2], ["C", "D"]);
			assert.equal(tree2.checkout.getRemovedRoots().length, 2);

			// check the detached field on the peer
			assert.equal(anchorAOnTree2.treeStatus, TreeStatus.Removed);
			assert.equal(anchorBOnTree2.treeStatus, TreeStatus.Removed);

			// send edits to move the collab window up
			root1.insertAt(0, ["y"]);
			provider.processMessages();
			root1.removeAt(0);
			provider.processMessages();

			assert.deepEqual([...root1], ["C", "D"]);
			assert.deepEqual([...root2], ["C", "D"]);

			// ensure the remove is out of the collab window
			assert(removeSequenceNumber < provider.minimumSequenceNumber);

			// check that the repair data on the peer is destroyed
			assert.equal(anchorAOnTree2.treeStatus, TreeStatus.Deleted);
			assert.equal(anchorBOnTree2.treeStatus, TreeStatus.Deleted);

			assert.equal(tree2.checkout.getRemovedRoots().length, 1);

			unsubscribe();
		});

		it("the collab window progresses far enough after a rebase", () => {
			const provider = new TestTreeProviderLite(2);
			const content = {
				schema: stringSequenceRootSchema,
				allowedSchemaModifications: AllowedUpdateType.Initialize,
				initialTree: ["A", "B", "C", "D"],
			} satisfies InitializeAndSchematizeConfiguration;
			const tree1 = schematizeFlexTree(provider.trees[0], content);

			// make sure that revertibles are created
			const { unsubscribe } = createTestUndoRedoStacks(tree1.checkout.events);

			provider.processMessages();
			const tree2 = schematizeFlexTree(provider.trees[1], content);

			const root1 = tree1.flexTree;
			const root2 = tree2.flexTree;

			root1.insertAt(1, ["x"]);
			assert.deepEqual([...root1], ["A", "x", "B", "C", "D"]);

			// get an anchor on the peer to the node we're removing
			const anchorCOnTree2 = TestAnchor.fromValue(tree2.checkout.forest, "C");

			root2.removeAt(2);
			assert.deepEqual([...root2], ["A", "B", "D"]);

			// Syncing will cause tree2 to rebase its local changes
			provider.processMessages();

			const removeSequenceNumber = provider.sequenceNumber;
			assert.deepEqual([...root1], ["A", "x", "B", "D"]);
			assert.deepEqual([...root2], ["A", "x", "B", "D"]);
			assert.equal(tree2.checkout.getRemovedRoots().length, 1);

			// check the detached field on the peer
			assert.equal(anchorCOnTree2.treeStatus, TreeStatus.Removed);

			// send edits to move the collab window up
			root1.insertAt(0, ["y"]);
			provider.processMessages();
			root1.removeAt(0);
			provider.processMessages();
			root2.insertAt(0, ["z"]);
			provider.processMessages();
			root2.removeAt(0);
			provider.processMessages();

			assert.deepEqual([...root1], ["A", "x", "B", "D"]);
			assert.deepEqual([...root2], ["A", "x", "B", "D"]);

			// ensure the remove is out of the collab window
			assert(removeSequenceNumber < provider.minimumSequenceNumber);

			// check that the repair data on the peer is destroyed
			assert.equal(anchorCOnTree2.treeStatus, TreeStatus.Deleted);

			unsubscribe();
		});

		it("the corresponding revertible is disposed", () => {
			const provider = new TestTreeProviderLite(2);
			const content = {
				schema: stringSequenceRootSchema,
				allowedSchemaModifications: AllowedUpdateType.Initialize,
				initialTree: ["A", "B", "C", "D"],
			} satisfies InitializeAndSchematizeConfiguration;
			const tree1 = schematizeFlexTree(provider.trees[0], content);

			// make sure that revertibles are created
			const { undoStack, unsubscribe } = createTestUndoRedoStacks(tree1.checkout.events);

			provider.processMessages();
			const tree2 = schematizeFlexTree(provider.trees[1], content);

			const root1 = tree1.flexTree;
			const root2 = tree2.flexTree;

			// get anchors to the nodes we're removing
			const anchorAOnTree1 = TestAnchor.fromValue(tree1.checkout.forest, "A");
			const anchorBOnTree1 = TestAnchor.fromValue(tree1.checkout.forest, "B");

			// remove in first tree
			root1.sequenceEditor().remove(0, 2);

			provider.processMessages();
			assert.deepEqual([...root1], ["C", "D"]);
			assert.deepEqual([...root2], ["C", "D"]);

			// check the detached fields on the first tree
			assert.equal(anchorAOnTree1.treeStatus, TreeStatus.Removed);
			assert.equal(anchorBOnTree1.treeStatus, TreeStatus.Removed);
			assert.equal(tree1.checkout.getRemovedRoots().length, 2);

			// dispose the revertible
			undoStack[0].dispose();

			// send edits to move the collab window up
			root1.insertAt(0, ["y"]);
			provider.processMessages();
			root1.removeAt(0);
			provider.processMessages();

			// check that the repair data on the first tree is destroyed
			assert.equal(anchorAOnTree1.treeStatus, TreeStatus.Deleted);
			assert.equal(anchorBOnTree1.treeStatus, TreeStatus.Deleted);
			assert.equal(tree1.checkout.getRemovedRoots().length, 1);

			unsubscribe();
		});

		it("created in a transaction with an aborted nested transaction", () => {
			const provider = new TestTreeProviderLite(2);
			const content = {
				schema: stringSequenceRootSchema,
				allowedSchemaModifications: AllowedUpdateType.Initialize,
				initialTree: ["A", "B", "C", "D"],
			} satisfies InitializeAndSchematizeConfiguration;
			const tree1 = schematizeFlexTree(provider.trees[0], content);

			// make sure that revertibles are created
			const { unsubscribe } = createTestUndoRedoStacks(tree1.checkout.events);

			provider.processMessages();
			const tree2 = schematizeFlexTree(provider.trees[1], content);

			const root1 = tree1.flexTree;
			const root2 = tree2.flexTree;

			// get an anchor on the peer to the node we're removing
			const anchorAOnTree2 = TestAnchor.fromValue(tree2.checkout.forest, "A");

			// remove in first tree in a transaction
			tree1.checkout.transaction.start();
			root1.removeAt(0);
			tree1.checkout.transaction.start();
			root1.removeAt(0);
			tree1.checkout.transaction.abort();
			tree1.checkout.transaction.commit();

			provider.processMessages();
			const removeSequenceNumber = provider.sequenceNumber;
			assert.deepEqual([...root1], ["B", "C", "D"]);
			assert.deepEqual([...root2], ["B", "C", "D"]);
			assert.equal(tree2.checkout.getRemovedRoots().length, 1);

			// check the detached field on the peer
			assert.equal(anchorAOnTree2.treeStatus, TreeStatus.Removed);

			// send edits to move the collab window up
			root1.insertAt(0, ["y"]);
			provider.processMessages();
			root1.removeAt(0);
			provider.processMessages();

			assert.deepEqual([...root1], ["B", "C", "D"]);
			assert.deepEqual([...root2], ["B", "C", "D"]);

			// ensure the remove is out of the collab window
			assert(removeSequenceNumber < provider.minimumSequenceNumber);

			// check that the repair data on the peer is destroyed
			assert.equal(anchorAOnTree2.treeStatus, TreeStatus.Deleted);
			assert.equal(tree2.checkout.getRemovedRoots().length, 1);

			unsubscribe();
		});
	});

	describe("is not destroyed when", () => {
		it("still relevant due to branches", () => {
			const provider = new TestTreeProviderLite(2);
			const content = {
				schema: stringSequenceRootSchema,
				allowedSchemaModifications: AllowedUpdateType.Initialize,
				initialTree: ["A", "B", "C", "D"],
			} satisfies InitializeAndSchematizeConfiguration;
			const tree1 = schematizeFlexTree(provider.trees[0], content);

			provider.processMessages();
			const tree2 = schematizeFlexTree(provider.trees[1], content);

			const root1 = tree1.flexTree;
			const root2 = tree2.flexTree;

			// get an anchor on the peer to the node we're removing
			const anchorAOnTree2 = TestAnchor.fromValue(tree2.checkout.forest, "A");

			// remove in first tree
			root1.removeAt(0);

			provider.processMessages();
			const removeSequenceNumber = provider.sequenceNumber;
			assert.deepEqual([...root1], ["B", "C", "D"]);
			assert.deepEqual([...root2], ["B", "C", "D"]);

			// create a fork at the creation of the repair data
			const _ = tree2.fork();

			// check the detached field on the peer
			assert.equal(anchorAOnTree2.treeStatus, TreeStatus.Removed);
			assert.equal(tree2.checkout.getRemovedRoots().length, 1);

			// send edits to move the collab window up
			root2.insertAt(3, ["y"]);
			provider.processMessages();
			root1.removeAt(3);
			provider.processMessages();
			root2.insertAt(3, ["y"]);
			provider.processMessages();
			root1.removeAt(3);
			provider.processMessages();

			assert.deepEqual([...root1], ["B", "C", "D"]);
			assert.deepEqual([...root2], ["B", "C", "D"]);

			// ensure the remove is out of the collab window
			assert(removeSequenceNumber < provider.minimumSequenceNumber);

			// check that the repair data on the peer is not destroyed
			assert.equal(anchorAOnTree2.treeStatus, TreeStatus.Removed);
			assert.equal(tree2.checkout.getRemovedRoots().length, 3);
		});

		it("still relevant due to revertibles", () => {
			const provider = new TestTreeProviderLite(2);
			const content = {
				schema: stringSequenceRootSchema,
				allowedSchemaModifications: AllowedUpdateType.Initialize,
				initialTree: ["A", "B", "C", "D"],
			} satisfies InitializeAndSchematizeConfiguration;
			const tree1 = schematizeFlexTree(provider.trees[0], content);

			// make sure that revertibles are created
			const { unsubscribe } = createTestUndoRedoStacks(tree1.checkout.events);

			provider.processMessages();
			const tree2 = schematizeFlexTree(provider.trees[1], content);

			const root1 = tree1.flexTree;
			const root2 = tree2.flexTree;

			// get an anchor to the node we're removing
			const anchorAOnTree1 = TestAnchor.fromValue(tree1.checkout.forest, "A");

			// get an anchor on the peer to the node we're removing
			const anchorAOnTree2 = TestAnchor.fromValue(tree2.checkout.forest, "A");

			// remove in first tree
			root1.removeAt(0);

			provider.processMessages();
			const removeSequenceNumber = provider.sequenceNumber;
			assert.deepEqual([...root1], ["B", "C", "D"]);
			assert.deepEqual([...root2], ["B", "C", "D"]);

			// check the detached field on the first tree
			assert.equal(anchorAOnTree1.treeStatus, TreeStatus.Removed);
			assert.equal(tree1.checkout.getRemovedRoots().length, 1);

			// send edits to move the collab window up
			root2.insertAt(3, ["y"]);
			provider.processMessages();
			root1.removeAt(3);
			provider.processMessages();
			root2.insertAt(3, ["y"]);
			provider.processMessages();
			root1.removeAt(3);
			provider.processMessages();

			assert.deepEqual([...root1], ["B", "C", "D"]);
			assert.deepEqual([...root2], ["B", "C", "D"]);

			// ensure the remove is out of the collab window
			assert(removeSequenceNumber < provider.minimumSequenceNumber);

			// check that the repair data on the first tree is not destroyed
			assert.equal(anchorAOnTree1.treeStatus, TreeStatus.Removed);
			assert.equal(tree1.checkout.getRemovedRoots().length, 3);

			// check that the repair data on the second tree is destroyed
			assert.equal(anchorAOnTree2.treeStatus, TreeStatus.Deleted);
			assert.equal(tree2.checkout.getRemovedRoots().length, 1);

			unsubscribe();
		});
	});
});
