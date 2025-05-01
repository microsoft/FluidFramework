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
import { Format as FormatV1 } from "../../../feature-libraries/schema-index/formatV1.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "../../snapshots/index.js";
import { type EncodingTestData, makeEncodingTestSuite } from "../../utils.js";
// eslint-disable-next-line import/no-internal-modules
import { toStoredSchema } from "../../../simple-tree/toStoredSchema.js";
import { SchemaFactory } from "../../../simple-tree/index.js";
import { JsonAsTree } from "../../../jsonDomainSchema.js";

const codecV1 = makeSchemaCodec({ jsonValidator: typeboxValidator }, 1);

const schema2 = toStoredSchema(SchemaFactory.optional(JsonAsTree.Primitive));

const testCases: EncodingTestData<TreeStoredSchema, FormatV1> = {
	successes: [
		["json", toStoredSchema(JsonAsTree.Tree)],
		["testSchemas", schema2],
	],
};

describe("SchemaIndex", () => {
	useSnapshotDirectory();

	it("SchemaIndexFormat - schema v1", () => {
		// Capture the json schema for the format as a snapshot, so any change to what schema is allowed shows up in this tests.
		takeJsonSnapshot(FormatV1);
	});

	it("accepts valid data - schema v1", () => {
		// TODO: should test way more cases, and check results are correct.
		const cases = [
			{
				version: 1 as const,
				nodes: {},
				root: { kind: "x" as FieldKindIdentifier, types: [] },
			} satisfies FormatV1,
		];
		for (const data of cases) {
			codecV1.decode(data);
		}
	});

	it("rejects malformed data - schema v1", () => {
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
			assert.throws(() => codecV1.decode(data as unknown as FormatV1));
		}
	});

	describe("codec", () => {
		makeEncodingTestSuite(makeCodecFamily([[1, codecV1]]), testCases, (a, b) => {
			assert(allowsRepoSuperset(defaultSchemaPolicy, a, b));
			assert(allowsRepoSuperset(defaultSchemaPolicy, b, a));
		});
	});

	// TODO: testing SchemaIndex class itself, specifically for attachment and normal summaries.
	// TODO: format compatibility tests to detect breaking of existing documents.
});
