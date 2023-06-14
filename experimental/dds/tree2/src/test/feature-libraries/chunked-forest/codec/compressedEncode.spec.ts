/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	decode,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/chunkDecoding";
import {
	NodeShape,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/nodeShape";
import {
	EncoderCache,
	FieldEncoderShape,
	FieldShaper,
	NodeEncoderShape,
	TreeShaper,
	anyFieldEncoder,
	compressedEncode,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/compressedEncode";
import { testTrees } from "../../../cursorTestSuite";
import {
	fieldCursorFromJsonableTrees,
	jsonableTreesFromFieldCursor,
} from "../fieldCursorTestUtilities";
import { FieldStoredSchema, TreeSchemaIdentifier } from "../../../../core";

const anyNodeShape = new NodeShape(undefined, undefined, [], [], anyFieldEncoder, anyFieldEncoder);

describe("compressedEncode", () => {
	describe("test trees", () => {
		for (const [name, jsonable] of testTrees) {
			it(name, () => {
				const input = fieldCursorFromJsonableTrees([jsonable]);
				const cache = new EncoderCache(
					(
						fieldShaper: FieldShaper,
						schemaName: TreeSchemaIdentifier,
					): NodeEncoderShape => anyNodeShape,
					(treeShaper: TreeShaper, field: FieldStoredSchema): FieldEncoderShape =>
						anyFieldEncoder,
				);
				// TODO: correct schema
				const result = compressedEncode(input, cache);
				const before = JSON.stringify(input);
				const output = JSON.stringify(result);

				const decoded = decode(result);
				const decodedJson = jsonableTreesFromFieldCursor(decoded.cursor());
				assert.deepEqual([jsonable], decodedJson);
			});
		}
	});
});
