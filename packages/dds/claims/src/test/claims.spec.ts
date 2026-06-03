/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { Claims } from "../claims.js";
import { ClaimsFactory } from "../claimsFactory.js";

function createConnectedClaims(
	id: string,
	runtimeFactory: MockContainerRuntimeFactory,
): Claims {
	const dataStoreRuntime = new MockFluidDataStoreRuntime();
	runtimeFactory.createContainerRuntime(dataStoreRuntime);
	const services = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	};

	const claims = new Claims(id, dataStoreRuntime, ClaimsFactory.Attributes);
	claims.connect(services);
	return claims;
}

const createLocalClaims = (id: string): Claims =>
	new Claims(id, new MockFluidDataStoreRuntime(), ClaimsFactory.Attributes);

describe("Claims", () => {
	describe("Local (detached) state", () => {
		let claims: Claims;

		beforeEach(() => {
			claims = createLocalClaims("claims");
		});

		it("Can create a Claims instance", () => {
			assert(claims !== undefined, "Could not create Claims");
		});

		it("getClaim returns undefined for unclaimed key", () => {
			assert.strictEqual(claims.getClaim("foo"), undefined);
		});

		it("trySetClaim succeeds immediately when detached", () => {
			const result = claims.trySetClaim("key", "value");
			assert.strictEqual(result.status, "Accepted");
			assert(result.status === "Accepted");
			assert.strictEqual(result.currentValue, "value");
			assert.strictEqual(claims.getClaim("key"), "value");
		});

		it("has() returns false for unclaimed key", () => {
			assert.strictEqual(claims.has("foo"), false);
		});

		it("has() returns true after detached trySetClaim", () => {
			claims.trySetClaim("key", "value");
			assert.strictEqual(claims.has("key"), true);
		});
	});

	describe("Connected state, single client", () => {
		let claims: Claims;
		let containerRuntimeFactory: MockContainerRuntimeFactory;

		beforeEach(() => {
			containerRuntimeFactory = new MockContainerRuntimeFactory();
			claims = createConnectedClaims("claims", containerRuntimeFactory);
		});

		it("Can create a connected Claims instance", () => {
			assert(claims !== undefined, "Could not create Claims");
		});

		it("Can claim a key and read it back", async () => {
			const claimResult = claims.trySetClaim("myKey", "myValue");
			assert.strictEqual(claimResult.status, "Pending");
			assert(claimResult.status === "Pending");

			containerRuntimeFactory.processAllMessages();
			const confirmation = await claimResult.promise;

			assert.strictEqual(confirmation.status, "Accepted");
			assert(confirmation.status === "Accepted");
			assert.strictEqual(confirmation.currentValue, "myValue");
			assert.strictEqual(claims.getClaim("myKey"), "myValue");
		});

		it("Returns AlreadyClaimed when claiming an already-committed key", async () => {
			// First claim
			const firstResult = claims.trySetClaim("myKey", "firstValue");
			assert(firstResult.status === "Pending");
			containerRuntimeFactory.processAllMessages();
			await firstResult.promise;

			// Second claim — should see it's already committed and return immediately
			const result = claims.trySetClaim("myKey", "secondValue");
			assert.strictEqual(result.status, "AlreadyClaimed");
			assert(result.status === "AlreadyClaimed");
			assert.strictEqual(result.currentValue, "firstValue");
		});

		it("Emits 'claimed' event when claim is accepted", async () => {
			let emittedKey: string | undefined;
			claims.on("claimed", (key: string) => {
				emittedKey = key;
			});

			const claimResult = claims.trySetClaim("eventKey", "eventValue");
			assert(claimResult.status === "Pending");
			containerRuntimeFactory.processAllMessages();
			await claimResult.promise;

			assert.strictEqual(emittedKey, "eventKey");
			// Value can be looked up from the DDS directly.
			assert.strictEqual(claims.getClaim("eventKey"), "eventValue");
		});

		it("Rejects duplicate pending claim for the same key", async () => {
			const firstResult = claims.trySetClaim("dupKey", "value1");
			assert(firstResult.status === "Pending");

			assert.throws(
				() => claims.trySetClaim("dupKey", "value2"),
				(error: Error) => {
					assert(
						error.message.includes("already pending"),
						`Unexpected error: ${error.message}`,
					);
					return true;
				},
			);

			containerRuntimeFactory.processAllMessages();
			await firstResult.promise;
		});
	});

	describe("Connected state, multiple clients", () => {
		let claims1: Claims;
		let claims2: Claims;
		let containerRuntimeFactory: MockContainerRuntimeFactory;

		beforeEach(() => {
			containerRuntimeFactory = new MockContainerRuntimeFactory();
			claims1 = createConnectedClaims("claims1", containerRuntimeFactory);
			claims2 = createConnectedClaims("claims2", containerRuntimeFactory);
		});

		it("First-writer-wins: first client's claim is accepted", async () => {
			// Both clients try to claim the same key before processing.
			const result1 = claims1.trySetClaim("raceKey", "value1");
			const result2 = claims2.trySetClaim("raceKey", "value2");
			assert(result1.status === "Pending");
			assert(result2.status === "Pending");

			containerRuntimeFactory.processAllMessages();

			const confirmation1 = await result1.promise;
			const confirmation2 = await result2.promise;

			// Client 1 submitted first, so it should win.
			assert.strictEqual(confirmation1.status, "Accepted");
			assert(confirmation1.status === "Accepted");
			assert.strictEqual(confirmation1.currentValue, "value1");

			assert.strictEqual(confirmation2.status, "AlreadyClaimed");
			assert(confirmation2.status === "AlreadyClaimed");
			assert.strictEqual(confirmation2.currentValue, "value1");

			// Both clients should see the same committed value.
			assert.strictEqual(claims1.getClaim("raceKey"), "value1");
			assert.strictEqual(claims2.getClaim("raceKey"), "value1");
		});

		it("Independent keys do not conflict", async () => {
			const result1 = claims1.trySetClaim("key1", "value1");
			const result2 = claims2.trySetClaim("key2", "value2");
			assert(result1.status === "Pending");
			assert(result2.status === "Pending");

			containerRuntimeFactory.processAllMessages();

			const confirmation1 = await result1.promise;
			const confirmation2 = await result2.promise;

			assert.strictEqual(confirmation1.status, "Accepted");
			assert.strictEqual(confirmation2.status, "Accepted");

			assert.strictEqual(claims1.getClaim("key1"), "value1");
			assert.strictEqual(claims1.getClaim("key2"), "value2");
			assert.strictEqual(claims2.getClaim("key1"), "value1");
			assert.strictEqual(claims2.getClaim("key2"), "value2");
		});
	});

	describe("Summary round-trip", () => {
		it("Can summarize and load claims", async () => {
			const containerRuntimeFactory = new MockContainerRuntimeFactory();
			const claims = createConnectedClaims("claims", containerRuntimeFactory);

			// Set a claim
			const claimResult = claims.trySetClaim("persistKey", "persistValue");
			assert(claimResult.status === "Pending");
			containerRuntimeFactory.processAllMessages();
			await claimResult.promise;

			// Summarize
			const summary = claims.getAttachSummary();

			// Load into a new instance
			const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
			containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);

			const services2 = {
				deltaConnection: dataStoreRuntime2.createDeltaConnection(),
				objectStorage: MockStorage.createFromSummary(summary.summary),
			};

			const claims2 = new Claims("claims2", dataStoreRuntime2, ClaimsFactory.Attributes);
			await claims2.load(services2);

			assert.strictEqual(claims2.getClaim("persistKey"), "persistValue");
			assert.strictEqual(claims2.getClaim("nonExistent"), undefined);
		});
	});

	describe("Compare-and-swap (CAS)", () => {
		let claims: Claims;
		let containerRuntimeFactory: MockContainerRuntimeFactory;

		beforeEach(() => {
			containerRuntimeFactory = new MockContainerRuntimeFactory();
			claims = createConnectedClaims("claims", containerRuntimeFactory);
		});

		it("CAS with undefined expectedValue succeeds on unclaimed key", async () => {
			// CAS with expectedValue=undefined means "set only if unset".
			const result = claims.compareAndSetClaim("casKey", "firstValue", undefined);
			assert.strictEqual(result.status, "Pending");
			assert(result.status === "Pending");

			containerRuntimeFactory.processAllMessages();
			const confirmation = await result.promise;
			assert.strictEqual(confirmation.status, "Accepted");
			assert.strictEqual(claims.getClaim("casKey"), "firstValue");
		});

		it("CAS with non-undefined expectedValue against unclaimed key returns AlreadyClaimed", () => {
			// CAS with a non-undefined expectedValue against a key that doesn't exist.
			const result = claims.compareAndSetClaim("casKey", "firstValue", "wrongValue");
			assert.strictEqual(result.status, "AlreadyClaimed");
			assert(result.status === "AlreadyClaimed");
			assert.strictEqual(result.currentValue, undefined);
		});

		it("CAS rejects when expectedValue doesn't match current", async () => {
			// First, claim the key.
			const firstResult = claims.trySetClaim("casKey", "firstValue");
			assert(firstResult.status === "Pending");
			containerRuntimeFactory.processAllMessages();
			await firstResult.promise;

			// CAS with wrong expected value should fail immediately.
			const result = claims.compareAndSetClaim("casKey", "secondValue", "wrongValue");
			assert.strictEqual(result.status, "AlreadyClaimed");
			assert(result.status === "AlreadyClaimed");
			assert.strictEqual(result.currentValue, "firstValue");
		});

		it("CAS succeeds when expectedValue matches current", async () => {
			// First, claim the key.
			const firstResult = claims.trySetClaim("casKey", "firstValue");
			assert(firstResult.status === "Pending");
			containerRuntimeFactory.processAllMessages();
			await firstResult.promise;

			// CAS with correct expected value should succeed.
			const result = claims.compareAndSetClaim("casKey", "secondValue", "firstValue");
			assert.strictEqual(result.status, "Pending");
			assert(result.status === "Pending");

			containerRuntimeFactory.processAllMessages();
			const confirmation = await result.promise;

			assert.strictEqual(confirmation.status, "Accepted");
			assert.strictEqual(claims.getClaim("casKey"), "secondValue");
		});

		it("Concurrent CAS: first writer wins", async () => {
			const claims1 = createConnectedClaims("claims1", containerRuntimeFactory);
			const claims2 = createConnectedClaims("claims2", containerRuntimeFactory);

			// Both claim the same key first.
			const claim1 = claims1.trySetClaim("casKey", "initialValue");
			assert(claim1.status === "Pending");
			containerRuntimeFactory.processAllMessages();
			await claim1.promise;

			// Both try CAS concurrently.
			const cas1 = claims1.compareAndSetClaim("casKey", "value1", "initialValue");
			const cas2 = claims2.compareAndSetClaim("casKey", "value2", "initialValue");
			assert(cas1.status === "Pending");
			assert(cas2.status === "Pending");

			containerRuntimeFactory.processAllMessages();

			const confirmation1 = await cas1.promise;
			const confirmation2 = await cas2.promise;

			// Client 1 submitted first, so it wins.
			assert.strictEqual(confirmation1.status, "Accepted");
			assert.strictEqual(confirmation2.status, "AlreadyClaimed");
			assert.strictEqual(claims1.getClaim("casKey"), "value1");
			assert.strictEqual(claims2.getClaim("casKey"), "value1");
		});
	});

	describe("Rollback", () => {
		it("Resolves pending promise as Aborted on rollback", async () => {
			const containerRuntimeFactory = new MockContainerRuntimeFactory({
				flushMode: 1, // turn-based: messages are not auto-flushed
			});
			const dataStoreRuntime = new MockFluidDataStoreRuntime();
			const containerRuntime =
				containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
			const services = {
				deltaConnection: dataStoreRuntime.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};

			const claims = new Claims("claims", dataStoreRuntime, ClaimsFactory.Attributes);
			claims.connect(services);

			const result = claims.trySetClaim("rollbackKey", "value");
			assert(result.status === "Pending");

			// Trigger rollback — rolls back the pending local message.
			containerRuntime.rollback?.();
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			const confirmation = await result.promise;
			assert.strictEqual(confirmation.status, "Aborted");

			// Key should not be committed.
			assert.strictEqual(claims.getClaim("rollbackKey"), undefined);
		});
	});

	describe("Dispose", () => {
		it("Aborts all pending promises on runtime dispose", async () => {
			const containerRuntimeFactory = new MockContainerRuntimeFactory();
			const dataStoreRuntime = new MockFluidDataStoreRuntime();
			containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
			const services = {
				deltaConnection: dataStoreRuntime.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};

			const claims = new Claims("claims", dataStoreRuntime, ClaimsFactory.Attributes);
			claims.connect(services);

			const result1 = claims.trySetClaim("key1", "value1");
			const result2 = claims.trySetClaim("key2", "value2");
			assert(result1.status === "Pending");
			assert(result2.status === "Pending");

			// Dispose the runtime, which should abort all pending claims.
			dataStoreRuntime.dispose();

			const confirmation1 = await result1.promise;
			const confirmation2 = await result2.promise;

			assert.strictEqual(confirmation1.status, "Aborted");
			assert.strictEqual(confirmation2.status, "Aborted");
		});
	});

	describe("Event behavior", () => {
		it("Does NOT emit 'claimed' when a claim is rejected", async () => {
			const containerRuntimeFactory = new MockContainerRuntimeFactory();
			const claims1 = createConnectedClaims("claims1", containerRuntimeFactory);
			const claims2 = createConnectedClaims("claims2", containerRuntimeFactory);

			// First client claims the key.
			const firstResult = claims1.trySetClaim("eventKey", "firstValue");
			assert(firstResult.status === "Pending");
			containerRuntimeFactory.processAllMessages();
			await firstResult.promise;

			// Track events on client 2.
			const emittedKeys: string[] = [];
			claims2.on("claimed", (key: string) => {
				emittedKeys.push(key);
			});

			// Client 2 tries to claim the same key — gets rejected locally.
			const secondResult = claims2.trySetClaim("eventKey", "secondValue");
			assert.strictEqual(secondResult.status, "AlreadyClaimed");

			// No event should have been emitted for the rejection.
			assert.strictEqual(emittedKeys.length, 0);
		});
	});

	describe("CAS edge cases", () => {
		it("CAS with non-undefined expectedValue against a missing key returns AlreadyClaimed", () => {
			const containerRuntimeFactory = new MockContainerRuntimeFactory();
			const claims = createConnectedClaims("claims", containerRuntimeFactory);

			// CAS with a non-undefined expectedValue against a key that doesn't exist.
			const result = claims.compareAndSetClaim("missingKey", "newValue", "expectedVal");
			assert.strictEqual(result.status, "AlreadyClaimed");
			assert(result.status === "AlreadyClaimed");
			assert.strictEqual(result.currentValue, undefined);
		});
	});

	describe("Summary round-trip with CAS", () => {
		it("Can summarize and load CAS-updated claims", async () => {
			const containerRuntimeFactory = new MockContainerRuntimeFactory();
			const claims = createConnectedClaims("claims", containerRuntimeFactory);

			// Initial claim
			const claimResult = claims.trySetClaim("casKey", "firstValue");
			assert(claimResult.status === "Pending");
			containerRuntimeFactory.processAllMessages();
			await claimResult.promise;

			// CAS update
			const casResult = claims.compareAndSetClaim("casKey", "secondValue", "firstValue");
			assert(casResult.status === "Pending");
			containerRuntimeFactory.processAllMessages();
			const casConfirmation = await casResult.promise;
			assert.strictEqual(casConfirmation.status, "Accepted");

			// Summarize
			const summary = claims.getAttachSummary();

			// Load into a new instance
			const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
			containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);

			const services2 = {
				deltaConnection: dataStoreRuntime2.createDeltaConnection(),
				objectStorage: MockStorage.createFromSummary(summary.summary),
			};

			const claims2 = new Claims("claims2", dataStoreRuntime2, ClaimsFactory.Attributes);
			await claims2.load(services2);

			// Should see the CAS-updated value.
			assert.strictEqual(claims2.getClaim("casKey"), "secondValue");
		});
	});

	describe("Garbage collection", () => {
		it("getGCData reports committed handle references", async () => {
			const containerRuntimeFactory = new MockContainerRuntimeFactory();
			const claims = createConnectedClaims("claims", containerRuntimeFactory);

			const handle = claims.handle;
			const result = claims.trySetClaim("gcKey", handle);
			assert(result.status === "Pending");
			containerRuntimeFactory.processAllMessages();
			await result.promise;

			const gcData = claims.getGCData();
			const outboundRoutes = gcData.gcNodes["/"];
			assert(outboundRoutes !== undefined, "GC node should exist");
			assert(
				outboundRoutes.includes(handle.absolutePath),
				`Committed handle path "${handle.absolutePath}" should appear in outbound routes`,
			);
		});

		it("getGCData reports pending handle references", () => {
			const containerRuntimeFactory = new MockContainerRuntimeFactory();
			const claims = createConnectedClaims("claims", containerRuntimeFactory);

			const handle = claims.handle;
			const result = claims.trySetClaim("pendingGcKey", handle);
			assert.strictEqual(result.status, "Pending");

			// Before processing, the handle is only in pendingClaims.
			const gcData = claims.getGCData();
			const outboundRoutes = gcData.gcNodes["/"];
			assert(outboundRoutes !== undefined, "GC node should exist");
			assert(
				outboundRoutes.includes(handle.absolutePath),
				`Pending handle path "${handle.absolutePath}" should appear in outbound routes`,
			);

			// Clean up to avoid unhandled promise.
			containerRuntimeFactory.processAllMessages();
		});

		it("getGCData reports both committed and pending handle references", async () => {
			const containerRuntimeFactory = new MockContainerRuntimeFactory();
			const claims = createConnectedClaims("claims", containerRuntimeFactory);
			const claims2 = createConnectedClaims("claims2", containerRuntimeFactory);

			// Commit one handle.
			const committedHandle = claims.handle;
			const firstResult = claims.trySetClaim("committed", committedHandle);
			assert(firstResult.status === "Pending");
			containerRuntimeFactory.processAllMessages();
			await firstResult.promise;

			// Submit a second handle that remains pending.
			const pendingHandle = claims2.handle;
			const secondResult = claims.trySetClaim("pending", pendingHandle);
			assert.strictEqual(secondResult.status, "Pending");

			const gcData = claims.getGCData();
			const outboundRoutes = gcData.gcNodes["/"];
			assert(outboundRoutes !== undefined, "GC node should exist");
			assert(
				outboundRoutes.includes(committedHandle.absolutePath),
				"Committed handle should appear in outbound routes",
			);
			assert(
				outboundRoutes.includes(pendingHandle.absolutePath),
				"Pending handle should appear in outbound routes",
			);

			containerRuntimeFactory.processAllMessages();
		});
	});

	describe("Handle values", () => {
		let claims: Claims;
		let containerRuntimeFactory: MockContainerRuntimeFactory;

		beforeEach(() => {
			containerRuntimeFactory = new MockContainerRuntimeFactory();
			claims = createConnectedClaims("claims", containerRuntimeFactory);
		});

		it("Can claim a key with a handle value", async () => {
			const handle = claims.handle;
			const result = claims.trySetClaim("handleKey", handle);
			assert.strictEqual(result.status, "Pending");
			assert(result.status === "Pending");

			containerRuntimeFactory.processAllMessages();
			const confirmation = await result.promise;

			assert.strictEqual(confirmation.status, "Accepted");
			assert(confirmation.status === "Accepted");
			assert.strictEqual(confirmation.currentValue, handle);
			// After roundtrip, getClaim returns deserialized handle — compare by path.
			const stored = claims.getClaim("handleKey") as { absolutePath: string };
			assert.strictEqual(stored.absolutePath, handle.absolutePath);
		});

		it("has() returns true for handle-valued claims", async () => {
			const handle = claims.handle;
			const result = claims.trySetClaim("handleKey", handle);
			assert(result.status === "Pending");

			containerRuntimeFactory.processAllMessages();
			await result.promise;

			assert.strictEqual(claims.has("handleKey"), true);
		});

		it("First-writer-wins works with handle values across clients", async () => {
			const claims2 = createConnectedClaims("claims2", containerRuntimeFactory);

			const handle1 = claims.handle;
			const handle2 = claims2.handle;

			const result1 = claims.trySetClaim("handleRace", handle1);
			const result2 = claims2.trySetClaim("handleRace", handle2);
			assert(result1.status === "Pending");
			assert(result2.status === "Pending");

			containerRuntimeFactory.processAllMessages();

			const confirmation1 = await result1.promise;
			const confirmation2 = await result2.promise;

			assert.strictEqual(confirmation1.status, "Accepted");
			assert.strictEqual(confirmation2.status, "AlreadyClaimed");
			// After roundtrip, handles are deserialized — compare by path.
			const localHandle = claims.getClaim("handleRace") as { absolutePath: string };
			assert.strictEqual(localHandle.absolutePath, handle1.absolutePath);
			const remoteHandle = claims2.getClaim("handleRace") as { absolutePath: string };
			assert.strictEqual(remoteHandle.absolutePath, handle1.absolutePath);
		});

		it("Handle values survive summary round-trip", async () => {
			const handle = claims.handle;
			const result = claims.trySetClaim("handlePersist", handle);
			assert(result.status === "Pending");
			containerRuntimeFactory.processAllMessages();
			await result.promise;

			// Summarize
			const summary = claims.getAttachSummary();

			// Load into a new instance
			const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
			containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);

			const services2 = {
				deltaConnection: dataStoreRuntime2.createDeltaConnection(),
				objectStorage: MockStorage.createFromSummary(summary.summary),
			};

			const claims2 = new Claims("claims2", dataStoreRuntime2, ClaimsFactory.Attributes);
			await claims2.load(services2);

			// The loaded value should be a handle (not undefined).
			const loadedValue = claims2.getClaim("handlePersist");
			assert(loadedValue !== undefined, "Handle value should survive summary round-trip");
			assert.strictEqual(claims2.has("handlePersist"), true);
		});
	});
});
