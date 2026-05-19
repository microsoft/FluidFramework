/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { enterStagingMode, reconnectAndSquash } from "@fluid-private/test-dds-utils";
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
		enterStagingMode(containerRuntime1);
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
		enterStagingMode(containerRuntime1);
		map1.set("k", "secret");
		map1.set("k", "final");
		reconnectAndSquash(containerRuntime1, dataStoreRuntime1);
		containerRuntimeFactory.processAllMessages();

		// The pre-staging "pre" is sent then overwritten by the staging "final" (which subsumed
		// "secret"). Peer's final view is "final"; "secret" never appears in a peer event.
		assert.equal(map2.get("k"), "final");
		const sawPre = peerChanges.some(
			(change) => change.key === "k" && change.newValue === "pre",
		);
		assert.equal(
			sawPre,
			true,
			"pre-staging set on the same key must land before the staged squash result",
		);
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

	it("drops a staged createSubDirectory + deleteSubDirectory pair so the subdir name doesn't leak", () => {
		// The subdir name itself is user-supplied content (e.g. a user id or tenant slug).
		// A staged create+delete pair on a name that didn't exist pre-staging nets to no-op
		// and must not transmit the name on commit.
		const peerSubdirCreatedNames: string[] = [];
		const peerSubdirDeletedNames: string[] = [];
		dir2.on("subDirectoryCreated", (name, local) => {
			if (!local) peerSubdirCreatedNames.push(name);
		});
		dir2.on("subDirectoryDeleted", (name, local) => {
			if (!local) peerSubdirDeletedNames.push(name);
		});

		containerRuntime1.connected = false;
		dir1.createSubDirectory("secret-id");
		dir1.deleteSubDirectory("secret-id");
		reconnectAndSquash(containerRuntime1, dataStoreRuntime1);
		containerRuntimeFactory.processAllMessages();

		assert.equal(dir2.getSubDirectory("secret-id"), undefined);
		assert.deepEqual(
			peerSubdirCreatedNames,
			[],
			"createSubDirectory must not reach the peer when paired with a staged delete",
		);
		assert.deepEqual(
			peerSubdirDeletedNames,
			[],
			"deleteSubDirectory must not reach the peer when paired with a staged create",
		);
	});

	it("keeps the final create when staged ops are create+delete+create on the same name", () => {
		const peerSubdirCreatedNames: string[] = [];
		dir2.on("subDirectoryCreated", (name, local) => {
			if (!local) peerSubdirCreatedNames.push(name);
		});

		containerRuntime1.connected = false;
		dir1.createSubDirectory("x");
		dir1.deleteSubDirectory("x");
		dir1.createSubDirectory("x");
		reconnectAndSquash(containerRuntime1, dataStoreRuntime1);
		containerRuntimeFactory.processAllMessages();

		assert.notEqual(dir2.getSubDirectory("x"), undefined, "final create should land on peer");
		assert.deepEqual(
			peerSubdirCreatedNames,
			["x"],
			"peer should observe exactly one createSubDirectory event",
		);
	});

	it("preserves a delete of a pre-existing subdirectory (no leak, no false subsumption)", () => {
		// Pre-create + ACK so "pre-existing" exists on the peer.
		dir1.createSubDirectory("pre");
		containerRuntimeFactory.processAllMessages();
		assert.notEqual(dir2.getSubDirectory("pre"), undefined);

		const peerSubdirDeletedNames: string[] = [];
		dir2.on("subDirectoryDeleted", (name, local) => {
			if (!local) peerSubdirDeletedNames.push(name);
		});

		containerRuntime1.connected = false;
		dir1.deleteSubDirectory("pre");
		reconnectAndSquash(containerRuntime1, dataStoreRuntime1);
		containerRuntimeFactory.processAllMessages();

		assert.equal(dir2.getSubDirectory("pre"), undefined);
		assert.deepEqual(
			peerSubdirDeletedNames,
			["pre"],
			"delete of pre-existing subdir must emit",
		);
	});

	it("drops staged storage ops on a subdirectory that is also pending-deleted in staging", () => {
		// Pre-create the subdirectory so the staging-mode set has a target. The pre-staging
		// createSubDirectory ACK lands before staging begins.
		dir1.createSubDirectory("sub");
		containerRuntimeFactory.processAllMessages();
		peerValueChanges = [];

		containerRuntime1.connected = false;
		// In staging: write a secret into the subdirectory, then delete the whole subdirectory.
		// The delete subsumes the set — the value must not reach the wire on commit.
		const sub = dir1.getSubDirectory("sub");
		assert(sub !== undefined);
		sub.set("k", "secret");
		dir1.deleteSubDirectory("sub");
		reconnectAndSquash(containerRuntime1, dataStoreRuntime1);
		containerRuntimeFactory.processAllMessages();

		assert.equal(
			dir2.getSubDirectory("sub"),
			undefined,
			"subdirectory should be removed on peer",
		);
		for (const change of peerValueChanges) {
			assert.notEqual(
				change.newValue,
				"secret",
				"staged value on a pending-deleted subdir must not leak",
			);
		}
	});

	it("squashes staged delete→create→delete on a pre-existing subdir to a single delete", () => {
		// Pre-create the subdir and let it ACK so it's "pre-existing" on both clients.
		dir1.createSubDirectory("x");
		containerRuntimeFactory.processAllMessages();
		assert.notEqual(dir2.getSubDirectory("x"), undefined);

		const peerSubdirCreatedNames: string[] = [];
		const peerSubdirDeletedNames: string[] = [];
		dir2.on("subDirectoryCreated", (name, local) => {
			if (!local) peerSubdirCreatedNames.push(name);
		});
		dir2.on("subDirectoryDeleted", (name, local) => {
			if (!local) peerSubdirDeletedNames.push(name);
		});

		// Without reference identity, the inner create would pair with the later delete and
		// leave the first delete unsplicable in pendingSubDirectoryData, causing a duplicate
		// delete on the wire and a 0xc31 assert on ACK.
		containerRuntime1.connected = false;
		dir1.deleteSubDirectory("x");
		dir1.createSubDirectory("x");
		dir1.deleteSubDirectory("x");
		reconnectAndSquash(containerRuntime1, dataStoreRuntime1);
		containerRuntimeFactory.processAllMessages();

		assert.equal(dir2.getSubDirectory("x"), undefined, "subdir should be deleted on peer");
		assert.deepEqual(
			peerSubdirCreatedNames,
			[],
			"the inner staged create must not reach the peer (it paired with the final delete)",
		);
		assert.deepEqual(
			peerSubdirDeletedNames,
			["x"],
			"peer should observe exactly one deleteSubDirectory event",
		);
	});

	it("preserves a pre-staging createSubDirectory in flight when staged delete+create on the same name is squashed", () => {
		// Pre-staging op still in flight at the runtime layer. The pre-staging create's
		// PendingSubDirectoryCreate entry must never be spliced by the staged squash logic —
		// only the staged entries are eligible. Without reference identity, the staged create's
		// findIndex-by-name would return the pre-staging entry and incorrectly pair it with the
		// staged delete, dropping the staged create from the wire and asserting 0xc33 on the
		// pre-staging ACK.
		const peerEvents: string[] = [];
		dir2.on("subDirectoryCreated", (name, local) => {
			if (!local) peerEvents.push(`created:${name}`);
		});
		dir2.on("subDirectoryDeleted", (name, local) => {
			if (!local) peerEvents.push(`deleted:${name}`);
		});

		dir1.createSubDirectory("y");
		enterStagingMode(containerRuntime1);
		dir1.deleteSubDirectory("y");
		dir1.createSubDirectory("y");
		reconnectAndSquash(containerRuntime1, dataStoreRuntime1);
		containerRuntimeFactory.processAllMessages();

		assert.notEqual(
			dir2.getSubDirectory("y"),
			undefined,
			"the staged create should land on the peer",
		);
		// The peer sees the pre-staging create, the staged delete that cancels it, and the
		// staged re-create — three events in order.
		assert.deepEqual(
			peerEvents,
			["created:y", "deleted:y", "created:y"],
			"peer should observe pre-staging create, staged delete, then staged re-create",
		);
	});
});
