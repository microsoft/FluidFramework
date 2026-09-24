/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
import type { IContainerContext } from "@fluidframework/container-definitions/internal";
import { SummaryType, type SummaryObject } from "@fluidframework/driver-definitions";
import type { ISummaryTree } from "@fluidframework/driver-definitions/internal";

import { materializeSeed } from "./runtimeMaterialization.js";
import { createSeedSummary, parseSeed, seedRoot } from "./seedFormat.js";
import { seedRuntimeFactory } from "./seedRuntimeFactory.js";
import { validateSummaryUpload } from "./summaryHost.js";

describe("Seed creation: deterministic construction and upload contract", () => {
	const seed = {
		format: "seed-creation/1",
		parts: [
			{ name: "first", text: "Hello" },
			{ name: "second", text: "World" },
		],
	};

	it("the producer writes only protocol and application input", () => {
		const summary = createSeedSummary(seed);
		assert.deepEqual(Object.keys(summary.tree).sort(), [".app", ".protocol"]);
		const app: SummaryObject | undefined = summary.tree[".app"];
		assert(app?.type === SummaryType.Tree);
		assert.deepEqual(Object.keys(app.tree), [seedRoot]);
	});

	it("independent materialization produces identical native trees and bytes", () => {
		const a = materializeSeed(seed, 0);
		const b = materializeSeed({ ...seed, parts: [...seed.parts].reverse() }, 0);
		assert.deepEqual(a.snapshot, b.snapshot);
		assert.deepEqual([...a.blobs], [...b.blobs]);
		assert(a.snapshot.blobs[".metadata"] !== undefined);
		assert(a.snapshot.blobs[".idCompressor"] !== undefined);
		assert(!JSON.stringify(a.snapshot).includes(seedRoot));
	});

	it("content and checkpoint changes alter the corresponding native snapshot", () => {
		const original = materializeSeed(seed, 0);
		assert.notDeepEqual(original.snapshot, materializeSeed(seed, 1).snapshot);
		assert.notDeepEqual(
			original.snapshot,
			materializeSeed(
				{
					...seed,
					parts: [{ name: "first", text: "Changed" }, seed.parts[1]],
				},
				0,
			).snapshot,
		);
	});

	for (const [name, input] of [
		["unknown format", { ...seed, format: "seed-creation/2" }],
		["wrong part count", { ...seed, parts: seed.parts.slice(0, 1) }],
		["duplicate names", { ...seed, parts: [seed.parts[0], seed.parts[0]] }],
		["unsupported asset field", { ...seed, assets: [] }],
		[
			"unsupported part field",
			{ ...seed, parts: [{ ...seed.parts[0], image: "url" }, seed.parts[1]] },
		],
		["invalid name", { ...seed, parts: [{ name: "../path", text: "" }, seed.parts[1]] }],
		[
			"trailing newline in name",
			{ ...seed, parts: [{ name: "first\n", text: "" }, seed.parts[1]] },
		],
		[
			"oversized text",
			{ ...seed, parts: [{ name: "first", text: "x".repeat(100_001) }, seed.parts[1]] },
		],
	] as const) {
		it(`rejects ${name} before materialization`, () => {
			assert.throws(() => parseSeed(input));
			assert.throws(() => materializeSeed(input, 0));
		});
	}

	it("rejects invalid checkpoints", () => {
		for (const sequence of [-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
			assert.throws(() => materializeSeed(seed, sequence));
		}
	});

	it("refuses a virtual subtree handle even when nested in the first full upload", () => {
		const summary: ISummaryTree = {
			type: SummaryType.Tree,
			tree: {
				".channels": {
					type: SummaryType.Tree,
					tree: {
						document: {
							type: SummaryType.Handle,
							handleType: SummaryType.Tree,
							handle: "/.channels/document",
						},
					},
				},
			},
		};
		assert.throws(
			() =>
				validateSummaryUpload(
					summary,
					{ ackHandle: "seed", proposalHandle: undefined, referenceSequenceNumber: 0 },
					"seed",
					true,
				),
			/virtual seed path/,
		);
		validateSummaryUpload(
			summary,
			{ ackHandle: "native", proposalHandle: undefined, referenceSequenceNumber: 0 },
			"native",
			false,
		);
	});

	it("an ACK alone cannot admit an incremental upload still naming the seed parent", () => {
		const summary: ISummaryTree = { type: SummaryType.Tree, tree: {} };
		assert.throws(
			() =>
				validateSummaryUpload(
					summary,
					{ ackHandle: "seed", proposalHandle: undefined, referenceSequenceNumber: 0 },
					"accepted-native",
					false,
				),
			/parent was not adopted/,
		);
	});
});

describe("Seed creation: checkpoint guard at load time", () => {
	it("rejects a still-seed snapshot before reading its content once ops have been sequenced", async () => {
		const fakeContext = {
			attachState: AttachState.Attached,
			baseSnapshot: {
				blobs: {},
				trees: { [seedRoot]: { blobs: { "seed.json": "seed-blob" }, trees: {} } },
			},
			pendingLocalState: undefined,
			taggedLogger: { send: () => {} },
			getLoadedFromVersion: () => ({ id: "fake-version" }),
			deltaManager: { initialSequenceNumber: 1 },
			storage: {
				readBlob: () => {
					throw new Error("Must not read the seed blob before the checkpoint guard runs");
				},
			},
		} as unknown as IContainerContext;
		await assert.rejects(
			seedRuntimeFactory().instantiateRuntime(fakeContext, true),
			/ops were sequenced/,
		);
	});
});
