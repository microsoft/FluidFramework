/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	makeUncompressedCodec,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/uncompressedCodecs";
import { testTrees } from "../../../cursorTestSuite";
import { jsonableTreesFromFieldCursor } from "../fieldCursorTestUtilities";
import { typeboxValidator } from "../../../../external-utilities";
import { cursorForJsonableTreeField } from "../../../../feature-libraries";

describe("uncompressedEncode", () => {
	describe("test trees", () => {
		for (const [name, jsonable] of testTrees) {
			it(name, () => {
				const input = cursorForJsonableTreeField([jsonable]);
				const codec = makeUncompressedCodec({ jsonValidator: typeboxValidator });
				const result = codec.encode(input);
				const decoded = codec.decode(result);
				const decodedJson = jsonableTreesFromFieldCursor(decoded);
				assert.deepEqual([jsonable], decodedJson);
			});
		}
	});
});
