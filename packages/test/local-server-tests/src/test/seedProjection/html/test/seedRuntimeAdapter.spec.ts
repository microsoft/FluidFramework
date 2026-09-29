/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	IContainerContext,
	IRuntime,
} from "@fluidframework/container-definitions/internal";

import { createProjectionManifest, projectionLayout } from "../appProjection.js";
import { buildRuntimeSnapshot } from "../runtimeMaterialization.js";
import { htmlMaterializationProfile, htmlProjector } from "../sampleRuntimeFactory.js";
import { forward, seedRuntimeFactory } from "../seedRuntimeAdapter.js";

// Validate context forwarding and the decisions made before any native runtime can load.
describe("Seed projection reference: forwarding", () => {
	// Overrides must not snapshot live loader state or change the receiver of inherited/future methods.
	it("preserves live prototype getters, method receivers, and unknown capabilities", () => {
		const capability = Symbol("future loader capability");
		class Context {
			value = 1;
			get live(): number {
				return this.value;
			}
			method(): number {
				return this.value;
			}
			[capability](): number {
				return this.value + 1;
			}
		}
		const original = new Context();
		const facade = forward(original, { value: 100 });
		assert.equal(facade.value, 100);
		original.value = 2;
		assert.equal(facade.live, 2);
		const method = facade.method;
		assert.equal(method(), 2);
		assert.equal(facade[capability](), 3);
		assert(capability in facade);
		assert.equal(original.value, 2);
	});

	// The forwarding facade must remain usable even when loader-owned properties cannot be redefined.
	it("can overlay frozen source properties without mutating the source", () => {
		const source: Readonly<{ baseSnapshot: string; other: string }> = Object.freeze({
			baseSnapshot: "seed",
			other: "preserved",
		});
		const facade = forward(source, { baseSnapshot: "projected" });
		assert.equal(facade.baseSnapshot, "projected");
		assert.equal(source.baseSnapshot, "seed");
		assert.equal(facade.other, "preserved");
	});

	// Identical visible HTML at another checkpoint must not be mistaken for the same native genesis.
	it("binds the canonical fingerprint to the source checkpoint", () => {
		const parts = [
			{ name: "first", payload: "<p>a</p>" },
			{ name: "second", payload: "<p>b</p>" },
		];
		assert.notEqual(
			buildRuntimeSnapshot(parts, 0).fingerprint,
			buildRuntimeSnapshot(parts, 1).fingerprint,
		);
		assert.throws(() => buildRuntimeSnapshot(parts, -1));
		assert.throws(() => buildRuntimeSnapshot(parts, Number.NaN));
	});

	// Reject incompatible reconstruction before a native delegate could interpret pending operations.
	it("rejects a pending-state fingerprint mismatch before native runtime creation", async () => {
		const source = {
			baseSnapshot: {
				blobs: {},
				trees: {
					[projectionLayout.key]: {
						trees: {
							[projectionLayout.parts]: {
								blobs: {},
								trees: {
									first: { trees: {}, blobs: { "document.html": "first" } },
									second: { trees: {}, blobs: { "document.html": "second" } },
								},
							},
						},
						blobs: {
							[projectionLayout.manifest]: "manifest",
						},
					},
				},
			},
			deltaManager: { initialSequenceNumber: 0 },
			pendingLocalState: {
				type: "seed-projection-pending/1",
				provenance: {
					materializationProfile: htmlMaterializationProfile,
					fingerprint: "wrong",
					sourceSequenceNumber: 0,
				},
				seed: {
					manifestId: "manifest",
					partBlobIds: { first: "first", second: "second" },
					manifest: createProjectionManifest(),
					parts: [
						{ name: "first", payload: "<p>a</p>" },
						{ name: "second", payload: "<p>b</p>" },
					],
				},
				runtime: {},
			},
		} as unknown as IContainerContext;
		const factory = seedRuntimeFactory(htmlProjector, async () => {
			assert.fail("Native runtime must not load a mismatched genesis");
		});
		await assert.rejects(factory.instantiateRuntime(source, true), /fingerprint/);
	});

	// A graduated snapshot must load normally, even if materialization has explicitly been disabled.
	it("bypasses projection and unwraps pending state when the loader base is already native", async () => {
		const inner = { savedRuntimeState: true };
		const source = {
			baseSnapshot: { blobs: { ".metadata": "native" }, trees: {} },
			pendingLocalState: { type: "seed-projection-pending/1", runtime: inner },
		} as unknown as IContainerContext;
		let called = false;
		const factory = seedRuntimeFactory(
			{
				...htmlProjector,
				materialize: () => assert.fail("Native snapshots must never be reprojected"),
			},
			async (load) => {
				called = true;
				assert.equal(load.projected, false);
				assert.equal(load.context.baseSnapshot, source.baseSnapshot);
				assert.equal(load.context.pendingLocalState, inner);
				return { getPendingLocalState: () => inner } as unknown as IRuntime;
			},
			{ allowProjection: false },
		);
		await factory.instantiateRuntime(source, true);
		assert(called);
	});
});
