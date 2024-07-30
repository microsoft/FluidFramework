/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { encodeJsonableOrBinary, decodeJsonableOrBinary } from "../binaryEncoding.js";

describe("Binary encoding", () => {
	function testSameAsJson(content: unknown) {
		const res = JSON.stringify(content);
		const res2 = encodeJsonableOrBinary(content);
		assert(res === res2, "not same as JSON.stringify");
		if (res !== undefined) {
			assert.deepEqual(
				JSON.parse(res),
				decodeJsonableOrBinary(res),
				"not same as JSON.parse",
			);
		}
	}

	it("test no binary", () => {
		testSameAsJson(undefined);
		testSameAsJson(null);
		testSameAsJson({});
		testSameAsJson({ a: "test", b: 5 });
		testSameAsJson({ a: "test", b: { c: "test", d: undefined, e: [5, 6, undefined] } });
	});

	function testBinaryRoundtrip(content: unknown) {
		const res = encodeJsonableOrBinary(content);
		const content2 = decodeJsonableOrBinary(res);

		// This will not compare contents of arrays, only their presence!
		assert.deepEqual(content, content2);
		assert(res === encodeJsonableOrBinary(content2));
	}

	it("test binary conversions", () => {
		const arr = new Uint8Array([5, 6, 7, 100]);
		testBinaryRoundtrip({ a: 5, arr: arr.buffer, c: { x: arr.buffer } });
	});
});
