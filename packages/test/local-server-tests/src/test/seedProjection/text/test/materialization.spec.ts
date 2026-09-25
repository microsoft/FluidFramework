/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	assertDeterministicSeedConstruction,
	type SeedRuntimeSnapshot,
} from "@fluidframework/container-loader/legacy/alpha";

import { materializeSeed } from "../runtimeMaterialization.js";
import { parseSeed, seedRoot } from "../textSeedFormat.js";

/**
 * Creation time and telemetry identity are not collaborative identities: assert that they have
 * the expected shape, without requiring them to match between independent materializations.
 */
function assertMetadataShape(state: SeedRuntimeSnapshot): void {
	const metadataId: string | undefined = state.snapshot.blobs[".metadata"];
	assert(metadataId !== undefined);
	const metadataBytes = state.blobs.get(metadataId);
	assert(metadataBytes !== undefined);
	const metadata: unknown = JSON.parse(new TextDecoder().decode(metadataBytes));
	assert(typeof metadata === "object" && metadata !== null);
	assert("createContainerTimestamp" in metadata);
	assert.equal(typeof metadata.createContainerTimestamp, "number");
	assert("telemetryDocumentId" in metadata);
	assert.equal(typeof metadata.telemetryDocumentId, "string");
}

describe("Seed creation: deterministic application construction", () => {
	const seed = {
		format: "seed-creation/1",
		parts: [
			{ name: "first", text: "Hello" },
			{ name: "second", text: "World" },
		],
	};

	it("independent detached runtimes produce identical collaborative identities and state", async () => {
		const [a, b] = await Promise.all([
			materializeSeed(seed, 0),
			materializeSeed({ ...seed, parts: [...seed.parts].reverse() }, 0),
		]);
		assertMetadataShape(a);
		assertMetadataShape(b);
		assertDeterministicSeedConstruction(a, b, {
			excludeBlobNames: [".metadata"],
		});
		assert(a.snapshot.blobs[".metadata"] !== undefined);
		assert(a.snapshot.blobs[".idCompressor"] !== undefined);
		assert(!JSON.stringify(a.snapshot).includes(seedRoot));
	});

	it("changed application content changes the Fluid snapshot", async () => {
		const original = await materializeSeed(seed, 0);
		const changed = await materializeSeed(
			{
				...seed,
				parts: [{ name: "first", text: "Changed" }, seed.parts[1]],
			},
			0,
		);
		assert.notDeepEqual(original.snapshot, changed.snapshot);
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
		it(`rejects ${name} before materialization`, async () => {
			assert.throws(() => parseSeed(input));
			await assert.rejects(materializeSeed(input, 0));
		});
	}

	it("rejects every checkpoint other than the original creation checkpoint", async () => {
		for (const sequence of [-1, 0.5, 1, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
			await assert.rejects(materializeSeed(seed, sequence), /creation checkpoint/);
		}
	});
});
