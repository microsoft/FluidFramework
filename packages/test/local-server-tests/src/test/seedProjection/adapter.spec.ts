/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	IContainerContext,
	IRuntime,
} from "@fluidframework/container-definitions/internal";

import { forward, seedRuntimeFactory } from "./adapter.js";
import { htmlProjector } from "./application.js";
import { buildNativeBaseline, projectionKey } from "./baseline.js";
import { format } from "./html.js";

describe("Seed projection reference: forwarding", () => {
	it("preserves live prototype getters, method receivers, and unknown capabilities", () => {
		const capability = Symbol("future loader capability");
		class Context {
			value = 1;
			get live() {
				return this.value;
			}
			method() {
				return this.value;
			}
			[capability]() {
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

	it("binds the canonical fingerprint to the source checkpoint", () => {
		assert.notEqual(
			buildNativeBaseline("<p>a</p>", 0).fingerprint,
			buildNativeBaseline("<p>a</p>", 1).fingerprint,
		);
		assert.throws(() => buildNativeBaseline("<p>a</p>", -1));
		assert.throws(() => buildNativeBaseline("<p>a</p>", Number.NaN));
	});

	it("rejects a pending-state fingerprint mismatch before native runtime creation", async () => {
		const source = {
			baseSnapshot: {
				blobs: {},
				trees: {
					[projectionKey]: {
						trees: {},
						blobs: { "manifest.work": "manifest", "document.html": "html" },
					},
				},
			},
			deltaManager: { initialSequenceNumber: 0 },
			pendingLocalState: {
				type: "seed-projection-pending/1",
				provenance: { format, fingerprint: "wrong", sourceSequenceNumber: 0 },
				seed: {
					manifestId: "manifest",
					htmlId: "html",
					manifest: JSON.stringify({ format, html: "document.html" }),
					html: "<p>a</p>",
				},
				runtime: {},
			},
		} as unknown as IContainerContext;
		const factory = seedRuntimeFactory(htmlProjector, async () => {
			assert.fail("Native runtime must not load a mismatched genesis");
		});
		await assert.rejects(factory.instantiateRuntime(source, true), /fingerprint/);
	});

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
