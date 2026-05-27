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

import { Claims } from "../sharedClaims.js";
import { ClaimsFactory } from "../sharedClaimsFactory.js";

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

	const sharedClaims = new Claims(id, dataStoreRuntime, ClaimsFactory.Attributes);
	sharedClaims.connect(services);
	return sharedClaims;
}

const createLocalClaims = (id: string): Claims =>
	new Claims(id, new MockFluidDataStoreRuntime(), ClaimsFactory.Attributes);

describe("Claims", () => {
	describe("Local (detached) state", () => {
		let sharedClaims: Claims;

		beforeEach(() => {
			sharedClaims = createLocalClaims("claims");
		});

		it("Can create a Claims instance", () => {
			assert(sharedClaims !== undefined, "Could not create Claims");
		});

		it("getClaim returns undefined for unclaimed key", () => {
			assert.strictEqual(sharedClaims.getClaim("foo"), undefined);
		});

		it("trySetClaim throws UsageError when detached", () => {
			assert.throws(
				() => sharedClaims.trySetClaim("key", "value"),
				(error: Error) => {
					assert(error.message.includes("detached"), `Unexpected error: ${error.message}`);
					return true;
				},
			);
		});
	});

	describe("Connected state, single client", () => {
		let sharedClaims: Claims;
		let containerRuntimeFactory: MockContainerRuntimeFactory;

		beforeEach(() => {
			containerRuntimeFactory = new MockContainerRuntimeFactory();
			sharedClaims = createConnectedClaims("claims", containerRuntimeFactory);
		});

		it("Can create a connected Claims instance", () => {
			assert(sharedClaims !== undefined, "Could not create Claims");
		});

		it("Can claim a key and read it back", async () => {
			const claimResult = sharedClaims.trySetClaim("myKey", "myValue");
			assert.strictEqual(claimResult.status, "Pending");
			assert(claimResult.status === "Pending");

			containerRuntimeFactory.processAllMessages();
			const confirmation = await claimResult.promise;

			assert.strictEqual(confirmation.status, "Accepted");
			assert(confirmation.status === "Accepted");
			assert.strictEqual(confirmation.currentValue, "myValue");
			assert.strictEqual(sharedClaims.getClaim("myKey"), "myValue");
		});

		it("Returns AlreadyClaimed when claiming an already-committed key", async () => {
			// First claim
			const firstResult = sharedClaims.trySetClaim("myKey", "firstValue");
			assert(firstResult.status === "Pending");
			containerRuntimeFactory.processAllMessages();
			await firstResult.promise;

			// Second claim — should see it's already committed and return immediately
			const result = sharedClaims.trySetClaim("myKey", "secondValue");
			assert.strictEqual(result.status, "AlreadyClaimed");
			assert(result.status === "AlreadyClaimed");
			assert.strictEqual(result.currentValue, "firstValue");
		});

		it("Emits 'claimed' event when claim is accepted", async () => {
			let emittedKey: string | undefined;
			sharedClaims.on("claimed", (key: string) => {
				emittedKey = key;
			});

			const claimResult = sharedClaims.trySetClaim("eventKey", "eventValue");
			assert(claimResult.status === "Pending");
			containerRuntimeFactory.processAllMessages();
			await claimResult.promise;

			assert.strictEqual(emittedKey, "eventKey");
			// Value can be looked up from the DDS directly.
			assert.strictEqual(sharedClaims.getClaim("eventKey"), "eventValue");
		});

		it("Rejects duplicate pending claim for the same key", async () => {
			const firstResult = sharedClaims.trySetClaim("dupKey", "value1");
			assert(firstResult.status === "Pending");

			assert.throws(
				() => sharedClaims.trySetClaim("dupKey", "value2"),
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
		let sharedClaims: Claims;
		let containerRuntimeFactory: MockContainerRuntimeFactory;

		beforeEach(() => {
			containerRuntimeFactory = new MockContainerRuntimeFactory();
			sharedClaims = createConnectedClaims("claims", containerRuntimeFactory);
		});

		it("CAS with expectedValue=undefined acts like write-once", async () => {
			const result = sharedClaims.trySetClaim("casKey", "firstValue", undefined);
			assert.strictEqual(result.status, "Pending");
			assert(result.status === "Pending");

			containerRuntimeFactory.processAllMessages();
			const confirmation = await result.promise;

			assert.strictEqual(confirmation.status, "Accepted");
			assert.strictEqual(sharedClaims.getClaim("casKey"), "firstValue");
		});

		it("CAS rejects when expectedValue doesn't match current", async () => {
			// First, claim the key.
			const firstResult = sharedClaims.trySetClaim("casKey", "firstValue");
			assert(firstResult.status === "Pending");
			containerRuntimeFactory.processAllMessages();
			await firstResult.promise;

			// CAS with wrong expected value should fail immediately.
			const result = sharedClaims.trySetClaim("casKey", "secondValue", "wrongValue");
			assert.strictEqual(result.status, "AlreadyClaimed");
			assert(result.status === "AlreadyClaimed");
			assert.strictEqual(result.currentValue, "firstValue");
		});

		it("CAS succeeds when expectedValue matches current", async () => {
			// First, claim the key.
			const firstResult = sharedClaims.trySetClaim("casKey", "firstValue");
			assert(firstResult.status === "Pending");
			containerRuntimeFactory.processAllMessages();
			await firstResult.promise;

			// CAS with correct expected value should succeed.
			const result = sharedClaims.trySetClaim("casKey", "secondValue", "firstValue");
			assert.strictEqual(result.status, "Pending");
			assert(result.status === "Pending");

			containerRuntimeFactory.processAllMessages();
			const confirmation = await result.promise;

			assert.strictEqual(confirmation.status, "Accepted");
			assert.strictEqual(sharedClaims.getClaim("casKey"), "secondValue");
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
			const cas1 = claims1.trySetClaim("casKey", "value1", "initialValue");
			const cas2 = claims2.trySetClaim("casKey", "value2", "initialValue");
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
});
