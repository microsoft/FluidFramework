/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { FluidClientVersion } from "../../../codec/index.js";
import { FormatValidatorBasic } from "../../../external-utilities/index.js";
import { schemaCodecBuilder } from "../../../feature-libraries/index.js";
import {
	computeSchemaHash,
	computeViewSchemaHash,
	SchemaFactoryAlpha,
	StagedSchemaUpgradePolicy,
	toInitialSchema,
} from "../../../simple-tree/index.js";

describe("schema hash functions", () => {
	const sf = new SchemaFactoryAlpha("test");

	it("computes the same hash from a view schema and its encoded schema", () => {
		class Item extends sf.object("Item", {
			name: sf.string,
			value: sf.optional([sf.number, sf.boolean]),
		}) {}
		const codec = schemaCodecBuilder.build({
			minVersionForCollab: FluidClientVersion.v2_0,
			jsonValidator: FormatValidatorBasic,
		});
		const encoded = codec.encode(toInitialSchema(Item));

		assert.equal(computeViewSchemaHash(Item), computeSchemaHash(encoded));
	});

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
			computeViewSchemaHash([Original, first.null]),
			computeViewSchemaHash([second.null, Reordered]),
		);
		assert.equal(
			computeSchemaHash({ outer: { name: "record", value: 1 }, enabled: true }),
			computeSchemaHash({ enabled: true, outer: { value: 1, name: "record" } }),
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
		const options = { minVersionForCollab: FluidClientVersion.v2_43 };

		assert.equal(
			computeViewSchemaHash(original, undefined, options),
			computeViewSchemaHash(reorderedKeys, undefined, options),
		);
		assert.notEqual(
			computeViewSchemaHash(original, undefined, options),
			computeViewSchemaHash(reorderedArray, undefined, options),
		);
	});

	it("includes only enabled staged allowed types", () => {
		const stagedString = sf.staged(sf.string);
		const upgrade = stagedString.metadata.stagedSchemaUpgrade;
		assert(upgrade !== undefined);
		const stagedSchema = sf.types([sf.number, stagedString]);
		const enabled = StagedSchemaUpgradePolicy.enabledStagedUpgrades(upgrade);

		assert.equal(computeViewSchemaHash(stagedSchema), computeViewSchemaHash(sf.number));
		assert.equal(
			computeViewSchemaHash(stagedSchema, enabled),
			computeViewSchemaHash([sf.number, sf.string]),
		);
		assert.notEqual(
			computeViewSchemaHash(stagedSchema),
			computeViewSchemaHash(stagedSchema, enabled),
		);
	});

	it("includes only enabled staged optional fields", () => {
		const stagedSchema = sf.stagedOptional(sf.number);
		const upgrade = stagedSchema.isStagedOptional;
		assert(upgrade !== false);
		const enabled = StagedSchemaUpgradePolicy.enabledStagedUpgrades(upgrade);

		assert.equal(computeViewSchemaHash(stagedSchema), computeViewSchemaHash(sf.number));
		assert.equal(
			computeViewSchemaHash(stagedSchema, enabled),
			computeViewSchemaHash(sf.optional(sf.number)),
		);
		assert.notEqual(
			computeViewSchemaHash(stagedSchema),
			computeViewSchemaHash(stagedSchema, enabled),
		);
	});
});
