/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

// Allow importing from this specific file which is being tested:

import { makeCodecFamily } from "../../../codec/index.js";
import type { FieldKindIdentifier, TreeStoredSchema } from "../../../core/index.js";
import { typeboxValidator } from "../../../external-utilities/index.js";
import { allowsRepoSuperset, defaultSchemaPolicy } from "../../../feature-libraries/index.js";
/* eslint-disable-next-line import/no-internal-modules */
import { makeSchemaCodec } from "../../../feature-libraries/schema-index/codec.js";
/* eslint-disable-next-line import/no-internal-modules */
import { Format } from "../../../feature-libraries/schema-index/format.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "../../snapshots/index.js";
import { type EncodingTestData, makeEncodingTestSuite } from "../../utils.js";
// eslint-disable-next-line import/no-internal-modules
import { toStoredSchema } from "../../../simple-tree/toStoredSchema.js";
import { SchemaFactory } from "../../../simple-tree/index.js";
import { jsonPrimitiveSchema, JsonUnion } from "../../json/index.js";

const codec = makeSchemaCodec({ jsonValidator: typeboxValidator });

const schema2 = toStoredSchema(SchemaFactory.optional(jsonPrimitiveSchema));

const testCases: EncodingTestData<TreeStoredSchema, Format> = {
	successes: [
		["json", toStoredSchema(JsonUnion)],
		["testSchemas", schema2],
	],
};

describe("SchemaIndex", () => {
	useSnapshotDirectory();

	it("SchemaIndexFormat", () => {
		// Capture the json schema for the format as a snapshot, so any change to what schema is allowed shows up in this tests.
		takeJsonSnapshot(Format);
	});

	it("accepts valid data", () => {
		// TODO: should test way more cases, and check results are correct.
		const cases = [
			{
				version: 1 as const,
				nodes: {},
				root: { kind: "x" as FieldKindIdentifier, types: [] },
			} satisfies Format,
		];
		for (const data of cases) {
			codec.decode(data);
		}
	});

	it("rejects malformed data", () => {
		// TODO: should test way more cases
		// TODO: maybe well formed but semantically invalid data should be rejected (ex: with duplicates keys)?
		const badCases = [
			undefined,
			null,
			{},
			{ version: "1.0.0" },
			{ version: "1" },
			{ version: "2.0.0" },
			{ version: 1 },
			{ version: 2 },
			{ version: 1, nodeSchema: [], globalFieldSchema: [] },
			{ version: 1, nodeSchema: [], extraField: 0 },
		];
		for (const data of badCases) {
			assert.throws(() => codec.decode(data as unknown as Format));
		}
	});

	describe("codec", () => {
		makeEncodingTestSuite(makeCodecFamily([[1, codec]]), testCases, (a, b) => {
			assert(allowsRepoSuperset(defaultSchemaPolicy, a, b));
			assert(allowsRepoSuperset(defaultSchemaPolicy, b, a));
		});
	});

	// TODO: testing SchemaIndex class itself, specifically for attachment and normal summaries.
	// TODO: format compatibility tests to detect breaking of existing documents.
});
