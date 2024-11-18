/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	makeFieldBatchCodec,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/codecs.js";
import {
	TreeCompressionStrategy,
	cursorForJsonableTreeField,
} from "../../../../feature-libraries/index.js";
import { ajvValidator } from "../../../codec/index.js";
import { testTrees } from "../../../cursorTestSuite.js";
import { jsonableTreesFromFieldCursor } from "../fieldCursorTestUtilities.js";
import { testIdCompressor } from "../../../utils.js";

describe("uncompressedEncode", () => {
	// TODO: test non size 1 batches
	describe("test trees", () => {
		for (const [name, jsonable] of testTrees) {
			it(name, () => {
				const input = cursorForJsonableTreeField([jsonable]);
				const context = {
					encodeType: TreeCompressionStrategy.Uncompressed,
					originatorId: testIdCompressor.localSessionId,
					idCompressor: testIdCompressor,
				};
				const codec = makeFieldBatchCodec({ jsonValidator: ajvValidator }, 1);
				const result = codec.encode([input], context);
				const decoded = codec.decode(result, context);
				const decodedJson = decoded.map(jsonableTreesFromFieldCursor);
				assert.deepEqual([[jsonable]], decodedJson);
			});
		}
	});
});
