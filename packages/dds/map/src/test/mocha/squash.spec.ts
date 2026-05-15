/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { reconnectAndSquash } from "@fluid-private/test-dds-utils";
import {
	MockContainerRuntimeFactoryForReconnection,
	type MockContainerRuntimeForReconnection,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import {
	type ISharedDirectory,
	type ISharedMap,
	SharedDirectory,
	SharedMap,
} from "../../index.js";

interface KeyChange {
	key: string;
	previousValue: unknown;
	newValue: unknown;
}

describe("SharedMap squash on resubmit", () => {
	let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
	let dataStoreRuntime1: MockFluidDataStoreRuntime;
	let containerRuntime1: MockContainerRuntimeForReconnection;
	let map1: ISharedMap;
	let map2: ISharedMap;
	let peerChanges: KeyChange[];
	let peerClears: number;

	beforeEach("createMapsForSquash", () => {
		containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
		const factory = SharedMap.getFactory();

		dataStoreRuntime1 = new MockFluidDataStoreRuntime();
		containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
		map1 = factory.create(dataStoreRuntime1, "map1");
		map1.connect({
			deltaConnection: dataStoreRuntime1.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
		containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
		map2 = factory.create(dataStoreRuntime2, "map2");
		map2.connect({
			deltaConnection: dataStoreRuntime2.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		peerChanges = [];
		peerClears = 0;
		map2.on("valueChanged", (changed, local) => {
			if (!local) {
				peerChanges.push({
					key: changed.key,
					previousValue: changed.previousValue,
					newValue: map2.get(changed.key),
				});
			}
		});
		map2.on("clear", (local) => {
			if (!local) {
				peerClears++;
			}
		});
	});

	it("drops intermediate set when a later delete supersedes it on the same key", () => {
		const secret = "SSN: 123-45-6789";
		containerRuntime1.connected = false;
		map1.set("k1", secret);
		map1.delete("k1");
		reconnectAndSquash(containerRuntime1, dataStoreRuntime1);
		containerRuntimeFactory.processAllMessages();

		assert.equal(map1.get("k1"), undefined);
		assert.equal(map2.get("k1"), undefined);
		// k1 didn't exist on the peer before the squash, so the delete is harmless either way.
		// What matters: the secret must never have appeared as a newValue on the peer.
		for (const change of peerChanges) {
			assert.notEqual(change.newValue, secret, "secret must never leak through squash");
		}
	});

	it("collapses set-then-set to a single set with the final value", () => {
		const secret = "intermediate-secret";
		const finalValue = "final";
		containerRuntime1.connected = false;
		map1.set("k1", secret);
		map1.set("k1", finalValue);
		reconnectAndSquash(containerRuntime1, dataStoreRuntime1);
		containerRuntimeFactory.processAllMessages();

		assert.equal(map2.get("k1"), finalValue);
		assert.equal(peerChanges.length, 1, "peer should see exactly one valueChanged for k1");
		assert.equal(peerChanges[0]?.key, "k1");
		assert.equal(peerChanges[0]?.newValue, finalValue);
		for (const change of peerChanges) {
			assert.notEqual(change.newValue, secret);
		}
	});

	it("squashes independent keys to one op per key (LWW)", () => {
		containerRuntime1.connected = false;
		map1.set("a", "a0");
		map1.set("b", "b0");
		map1.set("a", "a1");
		map1.set("c", "c0");
		map1.set("a", "a2");
		map1.delete("b");
		reconnectAndSquash(containerRuntime1, dataStoreRuntime1);
		containerRuntimeFactory.processAllMessages();

		assert.equal(map2.get("a"), "a2");
		assert.equal(map2.get("b"), undefined);
		assert.equal(map2.get("c"), "c0");

		// One event per key: a's final value, b's speculative delete (matches existing semantics
		// where deletes are sent even when locally nothing changes), c's final value.
		const observedKeys = peerChanges.map((c) => c.key).sort();
		assert.deepEqual(observedKeys, ["a", "b", "c"]);
		assert.equal(peerChanges.find((c) => c.key === "a")?.newValue, "a2");
		assert.equal(peerChanges.find((c) => c.key === "b")?.newValue, undefined);
		assert.equal(peerChanges.find((c) => c.key === "c")?.newValue, "c0");
		// None of the intermediate values should have surfaced.
		for (const change of peerChanges) {
			assert.notEqual(change.newValue, "a0");
			assert.notEqual(change.newValue, "a1");
			assert.notEqual(change.newValue, "b0");
		}
	});

	it("drops set-then-set-then-set chains; intermediate values never appear on the wire", () => {
		containerRuntime1.connected = false;
		map1.set("k", "v1");
		map1.set("k", "v2");
		map1.set("k", "v3");
		map1.set("k", "v4");
		reconnectAndSquash(containerRuntime1, dataStoreRuntime1);
		containerRuntimeFactory.processAllMessages();

		assert.equal(map2.get("k"), "v4");
		const observedValues = peerChanges.map((c) => c.newValue);
		assert.deepEqual(observedValues, ["v4"]);
	});

	it("emits a clear when one occurred during staging", () => {
		// Pre-populate map2 via map1 with content the squashed clear should remove on the peer.
		map1.set("seed", "value");
		containerRuntimeFactory.processAllMessages();
		assert.equal(map2.get("seed"), "value");
		// Reset peer observations after pre-population.
		peerChanges = [];
		peerClears = 0;

		containerRuntime1.connected = false;
		map1.set("staging-set", "leaked");
		map1.clear();
		map1.set("after-clear", "kept");
		reconnectAndSquash(containerRuntime1, dataStoreRuntime1);
		containerRuntimeFactory.processAllMessages();

		assert.equal(peerClears, 1, "peer should observe exactly one clear");
		assert.equal(map2.get("seed"), undefined);
		assert.equal(map2.get("staging-set"), undefined);
		assert.equal(map2.get("after-clear"), "kept");
		for (const change of peerChanges) {
			assert.notEqual(change.newValue, "leaked", "pre-clear staged value must not leak");
		}
	});

	it("drops a delete that follows a clear (clear already removed the key on the peer)", () => {
		map1.set("seed", "value");
		containerRuntimeFactory.processAllMessages();
		peerChanges = [];
		peerClears = 0;

		containerRuntime1.connected = false;
		map1.clear();
		map1.delete("seed");
		reconnectAndSquash(containerRuntime1, dataStoreRuntime1);
		containerRuntimeFactory.processAllMessages();

		assert.equal(peerClears, 1);
		// We expect only the clear to reach the peer; the delete is subsumed.
		assert.equal(map2.get("seed"), undefined);
	});

	it("passes through a single pending set unchanged", () => {
		containerRuntime1.connected = false;
		map1.set("only", "value");
		reconnectAndSquash(containerRuntime1, dataStoreRuntime1);
		containerRuntimeFactory.processAllMessages();

		assert.equal(map2.get("only"), "value");
		assert.deepEqual(
			peerChanges.map((c) => ({ key: c.key, newValue: c.newValue })),
			[{ key: "only", newValue: "value" }],
		);
	});

	it("preserves a pre-staging set still in flight when a staging set on a different key is squashed", () => {
		// Submit a pre-staging set on key "a" while connected so it's in flight at the runtime
		// layer but not yet ACKed when we disconnect.
		map1.set("a", "pre");
		containerRuntime1.connected = false;
		// Staging-mode edits on a different key plus a self-subsumption pair on "a".
		map1.set("b", "secret-b");
		map1.set("b", "final-b");
		reconnectAndSquash(containerRuntime1, dataStoreRuntime1);
		containerRuntimeFactory.processAllMessages();

		assert.equal(map2.get("a"), "pre", "pre-staging set must still be delivered");
		assert.equal(map2.get("b"), "final-b");
		for (const change of peerChanges) {
			assert.notEqual(change.newValue, "secret-b", "intermediate staging value must not leak");
		}
	});

	it("preserves a pre-staging set when a staging set on the same key is squashed against itself", () => {
		// Pre-staging set on "k". Mixed-lifetime case: the pre-staging keySet and staging keySets
		// share one PendingKeyLifetime in the kernel.
		map1.set("k", "pre");
		containerRuntime1.connected = false;
		map1.set("k", "secret");
		map1.set("k", "final");
		reconnectAndSquash(containerRuntime1, dataStoreRuntime1);
		containerRuntimeFactory.processAllMessages();

		// The pre-staging "pre" is sent then overwritten by the staging "final" (which subsumed
		// "secret"). Peer's final view is "final"; "secret" never appears in a peer event.
		assert.equal(map2.get("k"), "final");
		for (const change of peerChanges) {
			assert.notEqual(change.newValue, "secret");
		}
	});
});

describe("SharedDirectory squash on resubmit (storage)", () => {
	let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
	let dataStoreRuntime1: MockFluidDataStoreRuntime;
	let containerRuntime1: MockContainerRuntimeForReconnection;
	let dir1: ISharedDirectory;
	let dir2: ISharedDirectory;
	let peerValueChanges: { path: string; key: string; newValue: unknown }[];

	beforeEach("createDirectoriesForSquash", () => {
		containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
		const factory = SharedDirectory.getFactory();

		dataStoreRuntime1 = new MockFluidDataStoreRuntime();
		containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
		dir1 = factory.create(dataStoreRuntime1, "dir1");
		dir1.connect({
			deltaConnection: dataStoreRuntime1.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
		containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
		dir2 = factory.create(dataStoreRuntime2, "dir2");
		dir2.connect({
			deltaConnection: dataStoreRuntime2.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		peerValueChanges = [];
		dir2.on("valueChanged", (changed, local) => {
			if (!local) {
				const subdir = dir2.getWorkingDirectory(changed.path);
				peerValueChanges.push({
					path: changed.path,
					key: changed.key,
					newValue: subdir?.get(changed.key),
				});
			}
		});
	});

	it("drops intermediate set when later delete supersedes it at the root", () => {
		const secret = "SSN: 123-45-6789";
		containerRuntime1.connected = false;
		dir1.set("k1", secret);
		dir1.delete("k1");
		reconnectAndSquash(containerRuntime1, dataStoreRuntime1);
		containerRuntimeFactory.processAllMessages();

		assert.equal(dir1.get("k1"), undefined);
		assert.equal(dir2.get("k1"), undefined);
		for (const change of peerValueChanges) {
			assert.notEqual(change.newValue, secret, "secret must not leak through squash");
		}
	});

	it("collapses set-then-set to a single set with the final value", () => {
		const secret = "intermediate";
		containerRuntime1.connected = false;
		dir1.set("k", secret);
		dir1.set("k", "final");
		reconnectAndSquash(containerRuntime1, dataStoreRuntime1);
		containerRuntimeFactory.processAllMessages();

		assert.equal(dir2.get("k"), "final");
		for (const change of peerValueChanges) {
			assert.notEqual(change.newValue, secret);
		}
	});

	it("squashes storage independently per subdirectory", () => {
		const subA = dir1.createSubDirectory("a");
		const subB = dir1.createSubDirectory("b");
		containerRuntimeFactory.processAllMessages();
		peerValueChanges = [];

		containerRuntime1.connected = false;
		subA.set("k", "secretA");
		subA.set("k", "finalA");
		subB.set("k", "secretB");
		subB.delete("k");
		reconnectAndSquash(containerRuntime1, dataStoreRuntime1);
		containerRuntimeFactory.processAllMessages();

		const subA2 = dir2.getWorkingDirectory("/a");
		const subB2 = dir2.getWorkingDirectory("/b");
		assert.equal(subA2?.get("k"), "finalA");
		assert.equal(subB2?.get("k"), undefined);
		for (const change of peerValueChanges) {
			assert.notEqual(change.newValue, "secretA");
			assert.notEqual(change.newValue, "secretB");
		}
	});

	it("emits a clear when a clear occurred during staging", () => {
		dir1.set("seed", "value");
		containerRuntimeFactory.processAllMessages();
		assert.equal(dir2.get("seed"), "value");
		peerValueChanges = [];

		containerRuntime1.connected = false;
		dir1.set("staging", "leaked");
		dir1.clear();
		dir1.set("after-clear", "kept");
		reconnectAndSquash(containerRuntime1, dataStoreRuntime1);
		containerRuntimeFactory.processAllMessages();

		assert.equal(dir2.get("seed"), undefined);
		assert.equal(dir2.get("staging"), undefined);
		assert.equal(dir2.get("after-clear"), "kept");
		for (const change of peerValueChanges) {
			assert.notEqual(change.newValue, "leaked");
		}
	});

	it("passes through a single pending set unchanged", () => {
		containerRuntime1.connected = false;
		dir1.set("only", "value");
		reconnectAndSquash(containerRuntime1, dataStoreRuntime1);
		containerRuntimeFactory.processAllMessages();

		assert.equal(dir2.get("only"), "value");
		assert.equal(peerValueChanges.length, 1);
		assert.equal(peerValueChanges[0]?.newValue, "value");
	});

	it("preserves a pre-staging set still in flight when a staging set on the same key is squashed", () => {
		// Mixed-lifetime case: pre-staging keySet and staging keySets share one
		// PendingKeyLifetime in the kernel.
		dir1.set("k", "pre");
		containerRuntime1.connected = false;
		dir1.set("k", "secret");
		dir1.set("k", "final");
		reconnectAndSquash(containerRuntime1, dataStoreRuntime1);
		containerRuntimeFactory.processAllMessages();

		assert.equal(dir2.get("k"), "final");
		for (const change of peerValueChanges) {
			assert.notEqual(change.newValue, "secret");
		}
	});
});
