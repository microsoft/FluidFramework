/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IDocumentMessage } from "@fluidframework/driver-definitions/internal";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { SchemaFactory, TreeViewConfiguration } from "../../simple-tree/index.js";
import { SharedTreeTestFactory } from "../utils.js";

const sf = new SchemaFactory("Test");
class TestNode extends sf.objectRecursive("test node", {
	child: sf.optionalRecursive([sf.number]),
}) {}

function setupTree(retainHistory = false) {
	const containerRuntimeFactory = new MockContainerRuntimeFactory({
		flushMode: FlushMode.TurnBased,
	});
	const dataStoreRuntime1 = new MockFluidDataStoreRuntime();

	const factory = SharedTreeTestFactory.build(() => {}, undefined, { retainHistory });

	const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
	const tree1 = factory.create(dataStoreRuntime1, "A");
	tree1.connect({
		deltaConnection: dataStoreRuntime1.createDeltaConnection(),
		objectStorage: new MockStorage(),
	});

	const view = tree1.viewWith(new TreeViewConfiguration({ schema: TestNode }));
	view.initialize(new TestNode({}));
	containerRuntime.flush();
	return { tree: tree1, view, containerRuntime, containerRuntimeFactory };
}

describe("SharedTreeCore rollback", () => {
	it("compaction safety: rolls back a pending edit without removing sequenced history", () => {
		const { tree, view, containerRuntime, containerRuntimeFactory } = setupTree(true);
		containerRuntimeFactory.processAllMessages();
		view.root.child = 1;
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();
		const first = tree.kernel.getTrunkHead();
		view.root.child = 2;
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();
		const second = tree.kernel.getTrunkHead();
		const secondSequenceNumber = containerRuntimeFactory.sequenceNumber;
		assert.equal(second.parent, first);

		// A later sequenced edit acknowledges the pair before the pending edit is authored.
		view.root.child = 3;
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();
		assert(containerRuntimeFactory.getMinSeq() >= secondSequenceNumber);
		const sequencedHead = tree.kernel.getTrunkHead();
		const sequenceNumber = containerRuntimeFactory.sequenceNumber;
		assert.equal(sequencedHead.parent, second);
		view.root.child = 4;
		const pending = tree.kernel.getLocalBranch().getHead();
		const pendingChange = pending.change;
		assert.notEqual(pending, sequencedHead);
		assert.equal(pending.parent, sequencedHead);
		const parent = first.parent;

		tree.kernel.compactHistory(first, second);

		assert.equal(second.parent, parent);
		assert.equal(tree.kernel.getTrunkHead(), sequencedHead);
		assert.equal(tree.kernel.getLocalBranch().getHead(), pending);
		assert.equal(pending.parent, sequencedHead);
		assert.equal(pending.change, pendingChange);
		assert.equal(view.root.child, 4);
		assert.equal(containerRuntimeFactory.sequenceNumber, sequenceNumber);
		assert.equal(containerRuntimeFactory.outstandingMessageCount, 0);
		const compactedChange = second.change;

		assert(containerRuntime.rollback !== undefined, "Expected runtime rollback support");
		containerRuntime.rollback();

		assert.equal(tree.kernel.getLocalBranch().getHead(), sequencedHead);
		assert.equal(tree.kernel.getTrunkHead(), sequencedHead);
		assert.equal(sequencedHead.parent, second);
		assert.equal(second.parent, parent);
		assert.equal(second.change, compactedChange);
		assert.equal(view.root.child, 3);
		const submitted: IDocumentMessage[] = [];
		const onPush = (messages: IDocumentMessage[]): void => {
			submitted.push(...messages);
		};
		containerRuntime.deltaManager.outbound.on("push", onPush);
		containerRuntime.flush();
		containerRuntime.deltaManager.outbound.off("push", onPush);
		assert.equal(submitted.length, 1);
		const contents: unknown = submitted[0].contents;
		assert(contents !== null && typeof contents === "object" && "type" in contents);
		// Rollback consumes revision IDs, but the rolled-back tree edit must not be submitted.
		assert.equal(contents.type, "idAllocation");
		containerRuntimeFactory.processAllMessages();
		assert.equal(view.root.child, 3);
		assert.equal(tree.kernel.getLocalBranch().getHead(), sequencedHead);
		assert.equal(tree.kernel.getTrunkHead(), sequencedHead);
		assert.equal(containerRuntimeFactory.sequenceNumber, sequenceNumber + 1);
		assert.equal(containerRuntimeFactory.outstandingMessageCount, 0);
		view.dispose();
	});

	it("should rollback a local insert operation", async () => {
		const { view, containerRuntime, containerRuntimeFactory } = setupTree();
		view.root = new TestNode({ child: 0 });
		assert.deepEqual(view.root.child, 0, "after local insert");

		// Rollback local change
		containerRuntime.rollback?.();
		assert.deepEqual(view.root.child, undefined, "after rollback of insert");

		// Process messages to ensure no-op
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();
		assert.deepEqual(view.root.child, undefined, "after processAllMessages post-rollback");
	});

	it("should rollback a local update operation", async () => {
		const { view, containerRuntime, containerRuntimeFactory } = setupTree();
		view.root = new TestNode({ child: 1 });
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();
		assert.deepEqual(view.root.child, 1, "after initial insert");

		// Local update
		view.root.child = 2;
		assert.deepEqual(view.root.child, 2, "after local update");

		containerRuntime.rollback?.();
		assert.deepEqual(view.root.child, 1, "after rollback of update");
	});

	it("should rollback a local delete operation", async () => {
		const { view, containerRuntime, containerRuntimeFactory } = setupTree();
		view.root = new TestNode({ child: 5 });
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();
		assert.deepEqual(view.root.child, 5, "after initial insert");

		// Local delete
		view.root.child = undefined;
		assert.deepEqual(view.root.child, undefined, "after local delete");

		containerRuntime.rollback?.();
		assert.deepEqual(view.root.child, 5, "after rollback of delete");
	});

	it("should rollback multiple local operations in sequence", async () => {
		const { view, containerRuntime, containerRuntimeFactory } = setupTree();
		view.root = new TestNode({ child: 10 });
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();
		assert.deepEqual(view.root.child, 10, "after initial insert");

		// Multiple local changes
		view.root.child = 20;
		view.root.child = undefined;
		view.root.child = 30;
		assert.deepEqual(view.root.child, 30, "after multiple local ops");

		containerRuntime.rollback?.();
		assert.deepEqual(view.root.child, 10, "after rollback of multiple ops");
	});

	it("should not rollback already flushed (acked) operations", async () => {
		const { view, containerRuntime, containerRuntimeFactory } = setupTree();
		view.root = new TestNode({ child: 100 });
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();
		assert.deepEqual(view.root.child, 100, "after flush and process");

		// Local change and flush again
		view.root.child = 200;
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();
		assert.deepEqual(view.root.child, 200, "after second flush");

		// Rollback should not affect acked changes
		containerRuntime.rollback?.();
		assert.deepEqual(view.root.child, 200, "rollback after flush (no effect)");
	});

	it("should be a no-op if rollback is called with no pending changes", async () => {
		const { view, containerRuntime, containerRuntimeFactory } = setupTree();
		view.root = new TestNode({ child: 7 });
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();
		assert.deepEqual(view.root.child, 7, "after flush");

		containerRuntime.rollback?.();
		assert.deepEqual(view.root.child, 7, "rollback with no pending changes");
	});

	it("should rollback local changes in presence of remote changes from another client", async () => {
		const containerRuntimeFactory = new MockContainerRuntimeFactory({
			flushMode: FlushMode.TurnBased,
		});
		const factory = SharedTreeTestFactory.build(() => {});

		// Client 1
		const dataStoreRuntime1 = new MockFluidDataStoreRuntime({
			clientId: "1",
		});
		const containerRuntime1 =
			containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
		const tree1 = factory.create(dataStoreRuntime1, "A");
		tree1.connect({
			deltaConnection: dataStoreRuntime1.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});
		const view1 = tree1.viewWith(new TreeViewConfiguration({ schema: TestNode }));
		view1.initialize(new TestNode({}));
		containerRuntime1.flush();

		// Client 2
		const dataStoreRuntime2 = new MockFluidDataStoreRuntime({
			clientId: "2",
		});
		const containerRuntime2 =
			containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
		const tree2 = factory.create(dataStoreRuntime2, "A");
		tree2.connect({
			deltaConnection: dataStoreRuntime2.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});
		const view2 = tree2.viewWith(new TreeViewConfiguration({ schema: TestNode }));
		view2.initialize(new TestNode({}));
		containerRuntime2.flush();

		containerRuntimeFactory.processAllMessages();

		// Client 1 makes a local change (not flushed)
		view1.root.child = 1;
		assert.deepEqual(view1.root.child, 1, "client 1 local change");

		// Client 2 makes a local change and flushes
		view2.root.child = 2;
		containerRuntime2.flush();
		containerRuntimeFactory.processAllMessages();

		// Rollback local change in client 1
		containerRuntime1.rollback?.();
		containerRuntime1.flush();
		containerRuntimeFactory.processAllMessages();

		// Should reflect remote change from client 2
		assert.deepEqual(view1.root.child, 2, "client 1 after rollback and remote change");
	});
});
