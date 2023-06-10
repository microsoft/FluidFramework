/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	decode,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/encoding/chunkDecoding";
import {
	uncompressedEncode,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/encoding/uncompressedEncode";
import {
	compressedEncode,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/encoding/compressedEncode";
import { testTrees } from "../../../cursorTestSuite";
import {
	fieldCursorFromJsonableTrees,
	jsonableTreesFromFieldCursor,
} from "../fieldCursorTestUtilities";
import { jsonRoot, jsonSchema } from "../../../../domains";
import { SchemaBuilder } from "../../../../feature-libraries";

describe("uncompressedEncode", () => {
	describe("test trees", () => {
		for (const [name, jsonable] of testTrees) {
			it(name, () => {
				const input = fieldCursorFromJsonableTrees([jsonable]);
				const result = uncompressedEncode(input);
				const before = JSON.stringify(input);
				const output = JSON.stringify(result);

				const decoded = decode(result);
				const decodedJson = jsonableTreesFromFieldCursor(decoded.cursor());
				assert.deepEqual([jsonable], decodedJson);
			});
		}
	});
});

const schema = new SchemaBuilder("test", jsonSchema).intoDocumentSchema(
	SchemaBuilder.fieldValue(...jsonRoot),
);

describe("compressedEncode", () => {
	describe("test trees", () => {
		for (const [name, jsonable] of testTrees) {
			it(name, () => {
				const input = fieldCursorFromJsonableTrees([jsonable]);
				// TODO: correct schema
				const result = compressedEncode(schema, input);
				const before = JSON.stringify(input);
				const output = JSON.stringify(result);

				const decoded = decode(result);
				const decodedJson = jsonableTreesFromFieldCursor(decoded.cursor());
				assert.deepEqual([jsonable], decodedJson);
			});
		}
	});
});
