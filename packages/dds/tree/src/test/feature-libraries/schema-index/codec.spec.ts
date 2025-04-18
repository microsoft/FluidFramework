/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

// Allow importing from this specific file which is being tested:

import { makeCodecFamily } from "../../../codec/index.js";
import {
	SchemaFormatVersion,
	type FieldKindIdentifier,
	type TreeStoredSchema,
} from "../../../core/index.js";
import { typeboxValidator } from "../../../external-utilities/index.js";
import { allowsRepoSuperset, defaultSchemaPolicy } from "../../../feature-libraries/index.js";
/* eslint-disable-next-line import/no-internal-modules */
import { makeSchemaCodec } from "../../../feature-libraries/schema-index/codec.js";
/* eslint-disable-next-line import/no-internal-modules */
import { Format as FormatV1 } from "../../../feature-libraries/schema-index/formatV1.js";
/* eslint-disable-next-line import/no-internal-modules */
import { Format as FormatV2 } from "../../../feature-libraries/schema-index/formatV2.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "../../snapshots/index.js";
import { type EncodingTestData, makeEncodingTestSuite } from "../../utils.js";
// eslint-disable-next-line import/no-internal-modules
import { toStoredSchema } from "../../../simple-tree/toStoredSchema.js";
import { SchemaFactory } from "../../../simple-tree/index.js";
import { JsonAsTree } from "../../../jsonDomainSchema.js";

const codec = makeSchemaCodec({ jsonValidator: typeboxValidator }, SchemaFormatVersion.V1);

const schema2 = toStoredSchema(SchemaFactory.optional(JsonAsTree.Primitive));

describe("SchemaIndex", () => {
	useSnapshotDirectory();

	const formats = [FormatV1, FormatV2];
	for (let formatIndex = 0; formatIndex < formats.length; formatIndex++) {
		it("SchemaIndexFormat", () => {
			// Capture the json schema for the format as a snapshot, so any change to what schema is allowed shows up in this tests.
			takeJsonSnapshot(formats[formatIndex], `Format_${formatIndex}`);
		});
	}

	it("accepts valid data: FormatV1", () => {
		// TODO: should test way more cases, and check results are correct.
		const cases = [
			{
				version: 1 as const,
				nodes: {},
				root: { kind: "x" as FieldKindIdentifier, types: [] },
			} satisfies FormatV1,
		];
		for (const data of cases) {
			codec.decode(data);
		}
	});

	it("accepts valid data: FormatV2", () => {
		// TODO: should test way more cases, and check results are correct.
		const cases = [
			{
				version: 2 as const,
				nodes: {},
				root: {
					kind: "x" as FieldKindIdentifier,
					types: [],
					persistedData: "This is a persisted string on a field.",
				},
				persistedData: "This is a persisted string at the root of the tree.",
			} satisfies FormatV2,
		];
		for (const data of cases) {
			codec.decode(data);
		}
	});

	for (const format of [FormatV1, FormatV2]) {
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
				assert.throws(() => codec.decode(data as unknown as typeof format));
			}
		});
	}

	describe("codec", () => {
		const testCasesV1: EncodingTestData<TreeStoredSchema, FormatV1> = {
			successes: [
				["json", toStoredSchema(JsonAsTree.Tree)],
				["testSchemas", schema2],
			],
		};

		makeEncodingTestSuite(makeCodecFamily([[1, codec]]), testCasesV1, (a, b) => {
			assert(allowsRepoSuperset(defaultSchemaPolicy, a, b));
			assert(allowsRepoSuperset(defaultSchemaPolicy, b, a));
		});

		const testCasesV2: EncodingTestData<TreeStoredSchema, FormatV2> = {
			successes: [
				["json", toStoredSchema(JsonAsTree.Tree)],
				["testSchemas", schema2],
			],
		};

		makeEncodingTestSuite(makeCodecFamily([[1, codec]]), testCasesV2, (a, b) => {
			assert(allowsRepoSuperset(defaultSchemaPolicy, a, b));
			assert(allowsRepoSuperset(defaultSchemaPolicy, b, a));
		});
	});

	// TODO: testing SchemaIndex class itself, specifically for attachment and normal summaries.
	// TODO: format compatibility tests to detect breaking of existing documents.
});
