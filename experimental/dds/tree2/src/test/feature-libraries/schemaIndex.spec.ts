/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { makeSchemaCodec } from "../../feature-libraries/schemaIndexFormat";

import { SchemaData } from "../../core";
import { typeboxValidator } from "../../external-utilities";
import { jsonSchema, jsonRoot } from "../../domains";
import { defaultSchemaPolicy, allowsRepoSuperset, SchemaBuilder } from "../../feature-libraries";

const codec = makeSchemaCodec({ jsonValidator: typeboxValidator });

describe("SchemaIndex", () => {
	it("roundtrip", () => {
		// Just test with the Json domain schema for now.
		// TODO: add more targeted tests, and tests for more cases.
		const data: SchemaData = new SchemaBuilder("roundtrip", {}, jsonSchema).intoDocumentSchema(
			SchemaBuilder.fieldOptional(...jsonRoot),
		);
		const s = codec.encode(data);
		const parsed = codec.decode(s);
		const s2 = codec.encode(parsed);
		assert.equal(s, s2);
		assert(allowsRepoSuperset(defaultSchemaPolicy, data, parsed));
		assert(allowsRepoSuperset(defaultSchemaPolicy, parsed, data));
	});

	it("accepts valid data", () => {
		// TODO: should test way more cases, and check results are correct.
		const cases = ['{"version": "1.0.0", "treeSchema": [], "rootFieldSchema": {"kind": "x" }}'];
		for (const data of cases) {
			codec.decode(data);
		}
	});

	it("rejects malformed data", () => {
		// TODO: should test way more cases
		// TODO: maybe well formed but semantically invalid data should be rejected (ex: with duplicates keys)?
		const badCases = [
			"",
			"{}",
			'{"version": "2.0.0"}',
			'{"version": "1.0.0"}',
			'{"version": "2.0.0"}',
			'{"version": "1.0.0", "treeSchema": [], "globalFieldSchema": []}',
			'{"version": "1.0.0", "treeSchema": [], "extraField": 0}',
		];
		for (const data of badCases) {
			assert.throws(() => codec.decode(data));
		}
	});

	// TODO: testing SchemaIndex class itself, specifically for attachment and normal summaries.
	// TODO: format compatibility tests to detect breaking of existing documents.
});
