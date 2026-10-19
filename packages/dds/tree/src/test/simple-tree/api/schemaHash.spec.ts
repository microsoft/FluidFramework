/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	computeSchemaHash,
	SchemaFactoryAlpha,
	StagedSchemaUpgradePolicy,
} from "../../../simple-tree/index.js";

describe("schema hash functions", () => {
	const sf = new SchemaFactoryAlpha("test");

	it("ignores allowed-type and object-key order", () => {
		const first = new SchemaFactoryAlpha("test");
		const second = new SchemaFactoryAlpha("test");
		class Original extends first.object("Record", {
			name: first.string,
			value: first.optional([first.number, first.boolean]),
		}) {}
		class Reordered extends second.object("Record", {
			value: second.optional([second.boolean, second.number]),
			name: second.string,
		}) {}

		assert.equal(
			computeSchemaHash([Original, first.null]),
			computeSchemaHash([second.null, Reordered]),
		);
	});

	it("ignores metadata object-key order but preserves metadata array order", () => {
		const original = sf.required(sf.number, {
			persistedMetadata: { labels: ["first", "second"], description: "value" },
		});
		const reorderedKeys = sf.required(sf.number, {
			persistedMetadata: { description: "value", labels: ["first", "second"] },
		});
		const reorderedArray = sf.required(sf.number, {
			persistedMetadata: { labels: ["second", "first"], description: "value" },
		});
		assert.equal(computeSchemaHash(original), computeSchemaHash(reorderedKeys));
		assert.notEqual(computeSchemaHash(original), computeSchemaHash(reorderedArray));
	});

	it("includes only enabled staged allowed types", () => {
		const stagedString = sf.staged(sf.string);
		const upgrade = stagedString.metadata.stagedSchemaUpgrade;
		assert(upgrade !== undefined);
		const stagedSchema = sf.types([sf.number, stagedString]);
		const enabled = StagedSchemaUpgradePolicy.enabledStagedUpgrades(upgrade);

		assert.equal(computeSchemaHash(stagedSchema), computeSchemaHash(sf.number));
		assert.equal(
			computeSchemaHash(stagedSchema, enabled),
			computeSchemaHash([sf.number, sf.string]),
		);
		assert.notEqual(computeSchemaHash(stagedSchema), computeSchemaHash(stagedSchema, enabled));
	});

	it("includes only enabled staged optional fields", () => {
		const stagedSchema = sf.stagedOptional(sf.number);
		const upgrade = stagedSchema.isStagedOptional;
		assert(upgrade !== false);
		const enabled = StagedSchemaUpgradePolicy.enabledStagedUpgrades(upgrade);

		assert.equal(computeSchemaHash(stagedSchema), computeSchemaHash(sf.number));
		assert.equal(
			computeSchemaHash(stagedSchema, enabled),
			computeSchemaHash(sf.optional(sf.number)),
		);
		assert.notEqual(computeSchemaHash(stagedSchema), computeSchemaHash(stagedSchema, enabled));
	});
});
