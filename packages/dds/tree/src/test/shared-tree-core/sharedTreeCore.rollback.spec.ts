/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { createIdCompressor } from "@fluidframework/id-compressor/internal";

import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { SharedTreeTestFactory } from "../utils.js";

import { SchemaFactory, TreeViewConfiguration } from "../../simple-tree/index.js";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";

const sf = new SchemaFactory("Test");
class TestNode extends sf.objectRecursive("test node", {
	child: sf.optionalRecursive([sf.number]),
}) {}

function setupTree() {
	const containerRuntimeFactory = new MockContainerRuntimeFactory({
		flushMode: FlushMode.TurnBased,
	});
	const dataStoreRuntime1 = new MockFluidDataStoreRuntime({
		idCompressor: createIdCompressor(),
	});

	const factory = new SharedTreeTestFactory(() => {});

	const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
	const tree1 = factory.create(dataStoreRuntime1, "A");
	tree1.connect({
		deltaConnection: dataStoreRuntime1.createDeltaConnection(),
		objectStorage: new MockStorage(),
	});

	const view = tree1.viewWith(new TreeViewConfiguration({ schema: TestNode }));
	view.initialize(new TestNode({}));
	containerRuntime.flush();
	return { view, containerRuntime, containerRuntimeFactory };
}

describe("SharedTreeCore rollback", () => {
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
		const factory = new SharedTreeTestFactory(() => {});

		// Client 1
		const dataStoreRuntime1 = new MockFluidDataStoreRuntime({
			idCompressor: createIdCompressor(),
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
			idCompressor: createIdCompressor(),
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
