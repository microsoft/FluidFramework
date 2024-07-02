/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	AllowedUpdateType,
	TreeNavigationResult,
	moveToDetachedField,
} from "../../core/index.js";
import type { InitializeAndSchematizeConfiguration } from "../../shared-tree/index.js";
import {
	TestTreeProviderLite,
	createTestUndoRedoStacks,
	schematizeFlexTree,
	stringSequenceRootSchema,
} from "../utils.js";

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
			const cursor = tree2.checkout.forest.allocateCursor();
			moveToDetachedField(tree2.checkout.forest, cursor);
			cursor.firstNode();
			assert.equal(cursor.value, "A");
			const anchor1 = cursor.buildAnchor();
			cursor.nextNode();
			assert.equal(cursor.value, "B");
			const anchor2 = cursor.buildAnchor();
			cursor.free();

			// remove in first tree
			root1.sequenceEditor().remove(0, 2);

			provider.processMessages();
			const removeSequenceNumber = provider.sequenceNumber;
			assert.deepEqual([...root1], ["C", "D"]);
			assert.deepEqual([...root2], ["C", "D"]);
			assert.equal(tree2.checkout.getRemovedRoots().length, 2);

			// check the detached field on the peer
			const repairCursor1 = tree2.checkout.forest.allocateCursor();
			assert.equal(
				tree2.checkout.forest.tryMoveCursorToNode(anchor1, repairCursor1),
				TreeNavigationResult.Ok,
			);
			assert.equal(repairCursor1.value, "A");
			assert.equal(
				tree2.checkout.forest.tryMoveCursorToNode(anchor2, repairCursor1),
				TreeNavigationResult.Ok,
			);
			assert.equal(repairCursor1.value, "B");
			repairCursor1.free();

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
			const repairCursor2 = tree2.checkout.forest.allocateCursor();
			assert.equal(
				tree2.checkout.forest.tryMoveCursorToNode(anchor1, repairCursor2),
				TreeNavigationResult.NotFound,
			);
			assert.equal(
				tree2.checkout.forest.tryMoveCursorToNode(anchor2, repairCursor2),
				TreeNavigationResult.NotFound,
			);
			repairCursor2.free();
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

			// insert and remove
			root1.insertAt(1, ["x"]);
			assert.deepEqual([...root1], ["A", "x", "B", "C", "D"]);

			// get an anchor on the peer to the node we're removing
			const cursor = tree2.checkout.forest.allocateCursor();
			moveToDetachedField(tree2.checkout.forest, cursor);
			cursor.enterNode(2);
			assert.equal(cursor.value, "C");
			const anchor = cursor.buildAnchor();
			cursor.free();

			root2.removeAt(2);
			assert.deepEqual([...root2], ["A", "B", "D"]);

			// Syncing will cause tree2 to rebase its local changes
			provider.processMessages();

			const removeSequenceNumber = provider.sequenceNumber;
			assert.deepEqual([...root1], ["A", "x", "B", "D"]);
			assert.deepEqual([...root2], ["A", "x", "B", "D"]);
			assert.equal(tree2.checkout.getRemovedRoots().length, 1);

			// check the detached field on the peer
			const repairCursor1 = tree2.checkout.forest.allocateCursor();
			assert.equal(
				tree2.checkout.forest.tryMoveCursorToNode(anchor, repairCursor1),
				TreeNavigationResult.Ok,
			);
			assert.equal(repairCursor1.value, "C");
			repairCursor1.free();

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
			const repairCursor2 = tree2.checkout.forest.allocateCursor();
			assert.equal(
				tree2.checkout.forest.tryMoveCursorToNode(anchor, repairCursor2),
				TreeNavigationResult.NotFound,
			);
			repairCursor2.free();
			assert.equal(tree2.checkout.getRemovedRoots().length, 2);

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
			const cursor = tree1.checkout.forest.allocateCursor();
			moveToDetachedField(tree1.checkout.forest, cursor);
			cursor.firstNode();
			assert.equal(cursor.value, "A");
			const anchor1 = cursor.buildAnchor();
			cursor.nextNode();
			assert.equal(cursor.value, "B");
			const anchor2 = cursor.buildAnchor();
			cursor.free();

			// remove in first tree
			root1.sequenceEditor().remove(0, 2);

			provider.processMessages();
			assert.deepEqual([...root1], ["C", "D"]);
			assert.deepEqual([...root2], ["C", "D"]);

			// check the detached fields on the first tree
			const repairCursor1 = tree1.checkout.forest.allocateCursor();
			assert.equal(
				tree1.checkout.forest.tryMoveCursorToNode(anchor1, repairCursor1),
				TreeNavigationResult.Ok,
			);
			assert.equal(repairCursor1.value, "A");
			assert.equal(
				tree1.checkout.forest.tryMoveCursorToNode(anchor2, repairCursor1),
				TreeNavigationResult.Ok,
			);
			assert.equal(repairCursor1.value, "B");
			repairCursor1.free();
			assert.equal(tree1.checkout.getRemovedRoots().length, 2);

			// dispose the revertible
			undoStack[0].dispose();

			// send edits to move the collab window up
			root1.insertAt(0, ["y"]);
			provider.processMessages();
			root1.removeAt(0);
			provider.processMessages();

			// check that the repair data on the first tree is destroyed
			const repairCursor2 = tree1.checkout.forest.allocateCursor();
			assert.equal(
				tree1.checkout.forest.tryMoveCursorToNode(anchor1, repairCursor2),
				TreeNavigationResult.NotFound,
			);
			assert.equal(
				tree1.checkout.forest.tryMoveCursorToNode(anchor2, repairCursor2),
				TreeNavigationResult.NotFound,
			);
			repairCursor2.free();
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
			const cursor = tree2.checkout.forest.allocateCursor();
			moveToDetachedField(tree2.checkout.forest, cursor);
			cursor.firstNode();
			assert.equal(cursor.value, "A");
			const anchor = cursor.buildAnchor();
			cursor.free();

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
			const repairCursor1 = tree2.checkout.forest.allocateCursor();
			assert.equal(
				tree2.checkout.forest.tryMoveCursorToNode(anchor, repairCursor1),
				TreeNavigationResult.Ok,
			);
			assert.equal(repairCursor1.value, "A");
			repairCursor1.free();

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
			const repairCursor2 = tree2.checkout.forest.allocateCursor();
			assert.equal(
				tree2.checkout.forest.tryMoveCursorToNode(anchor, repairCursor2),
				TreeNavigationResult.NotFound,
			);
			repairCursor2.free();
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
			const cursor = tree2.checkout.forest.allocateCursor();
			moveToDetachedField(tree2.checkout.forest, cursor);
			cursor.firstNode();
			assert.equal(cursor.value, "A");
			const anchor = cursor.buildAnchor();
			cursor.free();

			// remove in first tree
			root1.removeAt(0);

			provider.processMessages();
			const removeSequenceNumber = provider.sequenceNumber;
			assert.deepEqual([...root1], ["B", "C", "D"]);
			assert.deepEqual([...root2], ["B", "C", "D"]);

			// create a fork at the creation of the repair data
			const _ = tree2.fork();

			// check the detached field on the peer
			const repairCursor1 = tree2.checkout.forest.allocateCursor();
			assert.equal(
				tree2.checkout.forest.tryMoveCursorToNode(anchor, repairCursor1),
				TreeNavigationResult.Ok,
			);
			assert.equal(repairCursor1.value, "A");
			repairCursor1.free();
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
			const repairCursor2 = tree2.checkout.forest.allocateCursor();
			assert.equal(
				tree2.checkout.forest.tryMoveCursorToNode(anchor, repairCursor2),
				TreeNavigationResult.Ok,
			);
			assert.equal(repairCursor2.value, "A");
			repairCursor2.free();
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
			const cursor1 = tree1.checkout.forest.allocateCursor();
			moveToDetachedField(tree1.checkout.forest, cursor1);
			cursor1.firstNode();
			assert.equal(cursor1.value, "A");
			const anchor1 = cursor1.buildAnchor();
			cursor1.free();

			// get an anchor on the peer to the node we're removing
			const cursor2 = tree2.checkout.forest.allocateCursor();
			moveToDetachedField(tree2.checkout.forest, cursor2);
			cursor2.firstNode();
			assert.equal(cursor2.value, "A");
			const anchor2 = cursor2.buildAnchor();
			cursor2.free();

			// remove in first tree
			root1.removeAt(0);

			provider.processMessages();
			const removeSequenceNumber = provider.sequenceNumber;
			assert.deepEqual([...root1], ["B", "C", "D"]);
			assert.deepEqual([...root2], ["B", "C", "D"]);

			// check the detached field on the first tree
			const repairCursor1 = tree1.checkout.forest.allocateCursor();
			assert.equal(
				tree1.checkout.forest.tryMoveCursorToNode(anchor1, repairCursor1),
				TreeNavigationResult.Ok,
			);
			assert.equal(repairCursor1.value, "A");
			repairCursor1.free();
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
			const repairCursor2 = tree1.checkout.forest.allocateCursor();
			assert.equal(
				tree1.checkout.forest.tryMoveCursorToNode(anchor1, repairCursor2),
				TreeNavigationResult.Ok,
			);
			assert.equal(repairCursor2.value, "A");
			repairCursor2.free();
			assert.equal(tree1.checkout.getRemovedRoots().length, 3);

			// check that the repair data on the second tree is destroyed
			const repairCursor3 = tree2.checkout.forest.allocateCursor();
			assert.equal(
				tree2.checkout.forest.tryMoveCursorToNode(anchor2, repairCursor2),
				TreeNavigationResult.NotFound,
			);
			repairCursor3.free();
			assert.equal(tree2.checkout.getRemovedRoots().length, 1);

			unsubscribe();
		});
	});
});
