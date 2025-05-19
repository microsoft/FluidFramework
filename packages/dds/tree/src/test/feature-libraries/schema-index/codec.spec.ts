/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

// Allow importing from this specific file which is being tested:

import {
	SchemaCodecVersion,
	type FieldKindIdentifier,
	type TreeStoredSchema,
} from "../../../core/index.js";
import { typeboxValidator } from "../../../external-utilities/index.js";
import {
	allowsRepoSuperset,
	defaultSchemaPolicy,
	makeSchemaCodec,
} from "../../../feature-libraries/index.js";
/* eslint-disable-next-line import/no-internal-modules */
import { Format as FormatV1 } from "../../../feature-libraries/schema-index/formatV1.js";
// eslint-disable-next-line import/no-internal-modules
import { Format as FormatV2 } from "../../../feature-libraries/schema-index/formatV2.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "../../snapshots/index.js";
import { type EncodingTestData, makeEncodingTestSuite } from "../../utils.js";
// eslint-disable-next-line import/no-internal-modules
import { toStoredSchema } from "../../../simple-tree/toStoredSchema.js";
import { SchemaFactory } from "../../../simple-tree/index.js";
import { JsonAsTree } from "../../../jsonDomainSchema.js";
// eslint-disable-next-line import/no-internal-modules
import { makeSchemaCodecs } from "../../../feature-libraries/schema-index/index.js";

const schemaCodecs = makeSchemaCodecs({ jsonValidator: typeboxValidator });
const codecV1 = makeSchemaCodec({ jsonValidator: typeboxValidator }, SchemaCodecVersion.v1);
const codecV2 = makeSchemaCodec({ jsonValidator: typeboxValidator }, SchemaCodecVersion.v2);

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

	it("SchemaIndexFormat - schema v2", () => {
		// Capture the json schema for the format as a snapshot, so any change to what schema is allowed shows up in this tests.
		takeJsonSnapshot(FormatV2);
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

	it("accepts valid data - schema v2", () => {
		// TODO: should test way more cases, and check results are correct.
		const cases = [
			{
				version: 2 as const,
				nodes: {},
				root: { kind: "x" as FieldKindIdentifier, types: [] },
				metadata: { "ff-system": { "eDiscovery-exclude": "true" } },
			} satisfies FormatV2,
		];
		for (const data of cases) {
			codecV2.decode(data);
		}
	});

	// TODO: should test way more cases
	// TODO: maybe well formed but semantically invalid data should be rejected (ex: with duplicates keys)?
	/**
	 * A set of cases that are expected to be rejected by both the v1 and v2 codecs.
	 */
	const badCasesV1AndV2 = [
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

	it(`rejects malformed data - schema v1`, () => {
		for (const data of badCasesV1AndV2) {
			assert.throws(() => codecV1.decode(data as unknown as FormatV1));
		}
	});

	it(`rejects malformed data - schema v2`, () => {
		for (const data of badCasesV1AndV2) {
			assert.throws(() => codecV2.decode(data as unknown as FormatV2));
		}
	});

	describe("codec", () => {
		makeEncodingTestSuite(schemaCodecs, testCases, (a, b) => {
			assert(allowsRepoSuperset(defaultSchemaPolicy, a, b));
			assert(allowsRepoSuperset(defaultSchemaPolicy, b, a));
		});
	});

	// TODO: testing SchemaIndex class itself, specifically for attachment and normal summaries.
	// TODO: format compatibility tests to detect breaking of existing documents.
});
