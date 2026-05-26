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

import { SharedClaims } from "../sharedClaims.js";
import { SharedClaimsFactory } from "../sharedClaimsFactory.js";

function createConnectedSharedClaims(
	id: string,
	runtimeFactory: MockContainerRuntimeFactory,
): SharedClaims {
	const dataStoreRuntime = new MockFluidDataStoreRuntime();
	runtimeFactory.createContainerRuntime(dataStoreRuntime);
	const services = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	};

	const sharedClaims = new SharedClaims(
		id,
		dataStoreRuntime,
		SharedClaimsFactory.Attributes,
	);
	sharedClaims.connect(services);
	return sharedClaims;
}

const createLocalSharedClaims = (id: string): SharedClaims =>
	new SharedClaims(
		id,
		new MockFluidDataStoreRuntime(),
		SharedClaimsFactory.Attributes,
	);

describe("SharedClaims", () => {
	describe("Local (detached) state", () => {
		let sharedClaims: SharedClaims;

		beforeEach(() => {
			sharedClaims = createLocalSharedClaims("claims");
		});

		it("Can create a SharedClaims instance", () => {
			assert(sharedClaims !== undefined, "Could not create SharedClaims");
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
		let sharedClaims: SharedClaims;
		let containerRuntimeFactory: MockContainerRuntimeFactory;

		beforeEach(() => {
			containerRuntimeFactory = new MockContainerRuntimeFactory();
			sharedClaims = createConnectedSharedClaims("claims", containerRuntimeFactory);
		});

		it("Can create a connected SharedClaims instance", () => {
			assert(sharedClaims !== undefined, "Could not create SharedClaims");
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
			let emittedValue: unknown;
			sharedClaims.on("claimed", (key: string, value: unknown) => {
				emittedKey = key;
				emittedValue = value;
			});

			const claimResult = sharedClaims.trySetClaim("eventKey", "eventValue");
			assert(claimResult.status === "Pending");
			containerRuntimeFactory.processAllMessages();
			await claimResult.promise;

			assert.strictEqual(emittedKey, "eventKey");
			assert.strictEqual(emittedValue, "eventValue");
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
		let claims1: SharedClaims;
		let claims2: SharedClaims;
		let containerRuntimeFactory: MockContainerRuntimeFactory;

		beforeEach(() => {
			containerRuntimeFactory = new MockContainerRuntimeFactory();
			claims1 = createConnectedSharedClaims("claims1", containerRuntimeFactory);
			claims2 = createConnectedSharedClaims("claims2", containerRuntimeFactory);
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
			const claims = createConnectedSharedClaims("claims", containerRuntimeFactory);

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

			const claims2 = new SharedClaims(
				"claims2",
				dataStoreRuntime2,
				SharedClaimsFactory.Attributes,
			);
			await claims2.load(services2);

			assert.strictEqual(claims2.getClaim("persistKey"), "persistValue");
			assert.strictEqual(claims2.getClaim("nonExistent"), undefined);
		});
	});
});
