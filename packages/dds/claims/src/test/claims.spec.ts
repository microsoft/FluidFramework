/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockSharedObjectServices,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { SharedClaims as SharedClaimsClass } from "../claims.js";
import { SharedClaimsFactory } from "../claimsFactory.js";
import type { ClaimResult, IClaimAttempt, ISharedClaims } from "../interfaces.js";

function connect(
	runtime: MockFluidDataStoreRuntime,
	claims: ISharedClaims,
	factoryInstance: MockContainerRuntimeFactory,
): void {
	runtime.setAttachState(AttachState.Attached);
	factoryInstance.createContainerRuntime(runtime);
	(claims as SharedClaimsClass).connect({
		deltaConnection: runtime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	});
}

async function awaitOutcome(attempt: IClaimAttempt): Promise<ClaimResult> {
	return attempt.status === "Pending" ? attempt.result : attempt.status;
}

describe("SharedClaims", () => {
	const factory = new SharedClaimsFactory();

	describe("Detached", () => {
		it("first set returns synchronous Success", () => {
			const runtime = new MockFluidDataStoreRuntime();
			const claims = factory.create(runtime, "claims");
			const attempt = claims.trySetClaim("k", "v");
			assert.equal(attempt.status, "Success");
			assert.equal(claims.hasClaim("k"), true);
			assert.equal(claims.getClaim("k"), "v");
		});

		it("repeat detached set for same key keeps original value, still reports Success", () => {
			const runtime = new MockFluidDataStoreRuntime();
			const claims = factory.create(runtime, "claims");
			assert.equal(claims.trySetClaim("k", "v1").status, "Success");
			// Repeat in detached mode: we "won" both attempts, but the
			// stored value must remain the original.
			const second = claims.trySetClaim("k", "v2");
			assert.equal(second.status, "Success");
			assert.equal(claims.getClaim("k"), "v1", "value must not be overwritten");
		});

		it("rejects empty / non-string key", () => {
			const runtime = new MockFluidDataStoreRuntime();
			const claims = factory.create(runtime, "claims");
			assert.throws(() => claims.trySetClaim("", "v"));
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			assert.throws(() => claims.trySetClaim(42 as any, "v"));
		});

		it("emits claim-set on detached writes", () => {
			const runtime = new MockFluidDataStoreRuntime();
			const claims = factory.create(runtime, "claims");
			const events: [string, unknown][] = [];
			claims.on("claim-set", (k, v) => events.push([k, v]));
			claims.trySetClaim("a", 1);
			claims.trySetClaim("a", 2); // already-claimed, must not re-emit
			claims.trySetClaim("b", "x");
			assert.deepEqual(events, [
				["a", 1],
				["b", "x"],
			]);
		});
	});

	describe("Attached + connected", () => {
		let containerRuntimeFactory: MockContainerRuntimeFactory;
		let claims1: ISharedClaims;
		let claims2: ISharedClaims;

		beforeEach(() => {
			containerRuntimeFactory = new MockContainerRuntimeFactory();
			const runtime1 = new MockFluidDataStoreRuntime();
			claims1 = factory.create(runtime1, "claims");
			connect(runtime1, claims1, containerRuntimeFactory);

			const runtime2 = new MockFluidDataStoreRuntime();
			claims2 = factory.create(runtime2, "claims");
			connect(runtime2, claims2, containerRuntimeFactory);
		});

		it("returns Pending then resolves Success when uncontested", async () => {
			const attempt = claims1.trySetClaim("k", "v");
			assert.equal(attempt.status, "Pending");
			containerRuntimeFactory.processAllMessages();
			assert.equal(await awaitOutcome(attempt), "Success");
			assert.equal(claims1.getClaim("k"), "v");
			assert.equal(claims2.getClaim("k"), "v");
		});

		it("first-writer-wins across two clients", async () => {
			const a = claims1.trySetClaim("k", "from-1");
			const b = claims2.trySetClaim("k", "from-2");
			assert.equal(a.status, "Pending");
			assert.equal(b.status, "Pending");
			containerRuntimeFactory.processAllMessages();
			// The mock processes in submission order, so client 1 wins.
			assert.equal(await awaitOutcome(a), "Success");
			assert.equal(await awaitOutcome(b), "AlreadyClaimed");
			assert.equal(claims1.getClaim("k"), "from-1");
			assert.equal(claims2.getClaim("k"), "from-1");
		});

		it("repeat local trySetClaim while pending dedupes to the same promise", () => {
			const a = claims1.trySetClaim("k", "v");
			const b = claims1.trySetClaim("k", "v2");
			assert.equal(a.status, "Pending");
			assert.equal(b.status, "Pending");
			if (a.status === "Pending" && b.status === "Pending") {
				assert.equal(a.result, b.result);
			}
		});

		it("subsequent set after sequencing returns synchronous status", async () => {
			const a = claims1.trySetClaim("k", "v");
			containerRuntimeFactory.processAllMessages();
			await awaitOutcome(a);
			const a2 = claims1.trySetClaim("k", "v");
			assert.equal(a2.status, "Success");
			const b = claims2.trySetClaim("k", "other");
			assert.equal(b.status, "AlreadyClaimed");
		});
	});

	describe("Snapshot round-trip", () => {
		it("preserves claims through summarize / load", async () => {
			const runtime = new MockFluidDataStoreRuntime();
			const claims = factory.create(runtime, "claims");
			claims.trySetClaim("a", 1);
			claims.trySetClaim("b", { nested: "value" });

			const summary = (claims as SharedClaimsClass).getAttachSummary().summary;
			const services = MockSharedObjectServices.createFromSummary(summary);

			const runtime2 = new MockFluidDataStoreRuntime();
			const loaded = new SharedClaimsClass(
				"claims",
				runtime2,
				SharedClaimsFactory.Attributes,
			);
			await loaded.load(services);

			assert.equal(loaded.getClaim("a"), 1);
			assert.deepEqual(loaded.getClaim("b"), { nested: "value" });
			assert.equal(loaded.hasClaim("c"), false);
			// Loader never wrote, so it must not have any local wins.
			const attempt = loaded.trySetClaim("a", 999);
			assert.equal(attempt.status, "AlreadyClaimed");
		});
	});
});
