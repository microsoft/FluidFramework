/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";

import { SummaryType, type SummaryObject } from "@fluidframework/driver-definitions";

import { createSeedSummary } from "../externalSeedFile.js";
import { seedRoot } from "../textSeedFormat.js";

describe("Seed creation: external producer", () => {
	const seed = {
		format: "seed-creation/1",
		parts: [
			{ name: "first", text: "Hello" },
			{ name: "second", text: "World" },
		],
	};

	it("produces exactly the documented creation summary", async () => {
		const example: unknown = JSON.parse(
			await readFile(
				new URL(
					"../../../../../src/test/seedProjection/text/exampleSeedSummary.json",
					import.meta.url,
				),
				"utf8",
			),
		);
		assert.deepEqual(createSeedSummary(seed), example);
	});

	it("writes only application input and loader protocol, not a DDS snapshot", () => {
		const summary = createSeedSummary(seed);
		assert.deepEqual(Object.keys(summary.tree).sort(), [".app", ".protocol"]);
		const app: SummaryObject | undefined = summary.tree[".app"];
		assert(app?.type === SummaryType.Tree);
		assert.deepEqual(Object.keys(app.tree), [seedRoot]);
	});

	it("canonicalizes part order without changing the input", () => {
		const reversed = { ...seed, parts: [...seed.parts].reverse() };
		assert.deepEqual(createSeedSummary(reversed), createSeedSummary(seed));
		assert.equal(reversed.parts[0].name, "second");
	});
});
