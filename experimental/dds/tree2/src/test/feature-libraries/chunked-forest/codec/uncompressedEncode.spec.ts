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
	uncompressedEncode,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/uncompressedEncode";
import { testTrees } from "../../../cursorTestSuite";
import {
	fieldCursorFromJsonableTrees,
	jsonableTreesFromFieldCursor,
} from "../fieldCursorTestUtilities";

describe("uncompressedEncode", () => {
	describe("test trees", () => {
		for (const [name, jsonable] of testTrees) {
			it(name, () => {
				const input = fieldCursorFromJsonableTrees([jsonable]);
				const result = uncompressedEncode(input);
				const decoded = decode(result);
				const decodedJson = jsonableTreesFromFieldCursor(decoded.cursor());
				assert.deepEqual([jsonable], decodedJson);
			});
		}
	});
});
