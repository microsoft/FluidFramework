/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	makeFieldBatchCodec,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/codecs.js";
import { testTrees } from "../../../cursorTestSuite.js";
import { jsonableTreesFromFieldCursor } from "../fieldCursorTestUtilities.js";
import { typeboxValidator } from "../../../../external-utilities/index.js";
import {
	TreeCompressionStrategy,
	cursorForJsonableTreeField,
} from "../../../../feature-libraries/index.js";

describe("uncompressedEncode", () => {
	// TODO: test non size 1 batches
	describe("test trees", () => {
		for (const [name, jsonable] of testTrees) {
			it(name, () => {
				const input = cursorForJsonableTreeField([jsonable]);
				const codec = makeFieldBatchCodec({ jsonValidator: typeboxValidator })({
					encodeType: TreeCompressionStrategy.Uncompressed,
				});
				const result = codec.encode([input]);
				const decoded = codec.decode(result);
				const decodedJson = decoded.map(jsonableTreesFromFieldCursor);
				assert.deepEqual([[jsonable]], decodedJson);
			});
		}
	});
});
