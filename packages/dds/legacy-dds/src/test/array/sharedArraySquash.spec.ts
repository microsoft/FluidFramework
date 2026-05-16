/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { reconnectAndSquash } from "@fluid-private/test-dds-utils";
import type { IChannelFactory } from "@fluidframework/datastore-definitions/internal";
import {
	MockContainerRuntimeFactoryForReconnection,
	type MockContainerRuntimeForReconnection,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import type { ISharedArray, ISharedArrayOperation } from "../../index.js";
import { SharedArrayBuilder } from "../../index.js";

describe("SharedArray squash on resubmit", () => {
	let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
	let dataStoreRuntime1: MockFluidDataStoreRuntime;
	let containerRuntime1: MockContainerRuntimeForReconnection;
	let sharedArray1: ISharedArray<string>;
	let sharedArray2: ISharedArray<string>;
	let peerOps: ISharedArrayOperation[];
	let factory: IChannelFactory<ISharedArray<string>>;

	function createSharedArrayForSquash(id: string): {
		array: ISharedArray<string>;
		dataStoreRuntime: MockFluidDataStoreRuntime;
		containerRuntime: MockContainerRuntimeForReconnection;
	} {
		const dataStoreRuntime = new MockFluidDataStoreRuntime();
		dataStoreRuntime.local = false;
		const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
		const services = {
			deltaConnection: containerRuntime.createDeltaConnection(),
			objectStorage: new MockStorage(),
		};
		const array = factory.create(dataStoreRuntime, id);
		array.connect(services);
		return { array, dataStoreRuntime, containerRuntime };
	}

	beforeEach(() => {
		containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
		factory = SharedArrayBuilder<string>().getFactory();
		const response1 = createSharedArrayForSquash("sharedArray1");
		sharedArray1 = response1.array;
		dataStoreRuntime1 = response1.dataStoreRuntime;
		containerRuntime1 = response1.containerRuntime;
		const response2 = createSharedArrayForSquash("sharedArray2");
		sharedArray2 = response2.array;
		peerOps = [];
		sharedArray2.on("valueChanged", (op: ISharedArrayOperation) => {
			peerOps.push(op);
		});
	});

	it("drops a single insertEntry whose value is deleted within the staging session", () => {
		const secret = "SSN: 123-45-6789";

		containerRuntime1.connected = false;
		sharedArray1.insert(0, secret);
		sharedArray1.delete(0);
		reconnectAndSquash(containerRuntime1, dataStoreRuntime1);
		containerRuntimeFactory.processAllMessages();

		assert.deepEqual([...sharedArray1.get()], []);
		assert.deepEqual([...sharedArray2.get()], []);
		assert.deepEqual(
			peerOps,
			[],
			"peer must observe no ops; insert+delete pair should be dropped",
		);
	});

	it("drops every entry in a sequence of insert+delete pairs", () => {
		containerRuntime1.connected = false;
		sharedArray1.insert(0, "secret-A");
		sharedArray1.delete(0);
		sharedArray1.insert(0, "secret-B");
		sharedArray1.delete(0);
		reconnectAndSquash(containerRuntime1, dataStoreRuntime1);
		containerRuntimeFactory.processAllMessages();

		assert.deepEqual([...sharedArray1.get()], []);
		assert.deepEqual([...sharedArray2.get()], []);
		assert.deepEqual(peerOps, []);
	});

	it("keeps an insertEntry whose entry remains live at commit time", () => {
		containerRuntime1.connected = false;
		sharedArray1.insert(0, "keep-me");
		reconnectAndSquash(containerRuntime1, dataStoreRuntime1);
		containerRuntimeFactory.processAllMessages();

		assert.deepEqual([...sharedArray1.get()], ["keep-me"]);
		assert.deepEqual([...sharedArray2.get()], ["keep-me"]);
		assert.equal(peerOps.length, 1);
		assert.equal(peerOps[0]?.type, 0 /* insertEntry */);
	});

	it("drops only the squashable pair; keeps unrelated staged inserts", () => {
		containerRuntime1.connected = false;
		sharedArray1.insert(0, "live-1");
		sharedArray1.insert(1, "secret");
		sharedArray1.delete(1);
		sharedArray1.insert(1, "live-2");
		reconnectAndSquash(containerRuntime1, dataStoreRuntime1);
		containerRuntimeFactory.processAllMessages();

		assert.deepEqual([...sharedArray1.get()], ["live-1", "live-2"]);
		assert.deepEqual([...sharedArray2.get()], ["live-1", "live-2"]);
		for (const op of peerOps) {
			if ("value" in op) {
				assert.notEqual(op.value, "secret", "staged secret must not leak");
			}
		}
	});

	it("drops a move-chain ending in a delete", () => {
		// Seed a non-staged entry so move targets a valid position.
		sharedArray1.insert(0, "anchor");
		containerRuntimeFactory.processAllMessages();

		containerRuntime1.connected = false;
		sharedArray1.insert(1, "secret");
		// Move the staged entry to a different position (creates a new entryId for it).
		sharedArray1.move(1, 0);
		// Delete the moved value (now at index 0 after the move).
		sharedArray1.delete(0);
		reconnectAndSquash(containerRuntime1, dataStoreRuntime1);
		containerRuntimeFactory.processAllMessages();

		assert.deepEqual([...sharedArray1.get()], ["anchor"]);
		assert.deepEqual([...sharedArray2.get()], ["anchor"]);
		for (const op of peerOps) {
			if ("value" in op) {
				assert.notEqual(op.value, "secret", "staged secret must not leak");
			}
		}
	});

	it("does not drop a pre-staging insert", () => {
		// Pre-staging insert lands while connected, then disconnect, then staged insert+delete.
		sharedArray1.insert(0, "pre-staging");
		containerRuntime1.connected = false;
		sharedArray1.insert(1, "secret");
		sharedArray1.delete(1);
		reconnectAndSquash(containerRuntime1, dataStoreRuntime1);
		containerRuntimeFactory.processAllMessages();

		assert.deepEqual([...sharedArray1.get()], ["pre-staging"]);
		assert.deepEqual([...sharedArray2.get()], ["pre-staging"]);
		for (const op of peerOps) {
			if ("value" in op) {
				assert.notEqual(op.value, "secret", "staged secret must not leak");
			}
		}
	});
});
