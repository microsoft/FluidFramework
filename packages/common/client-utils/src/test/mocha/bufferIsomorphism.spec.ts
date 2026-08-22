/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import * as BufferBrowser from "../../bufferBrowser.js";
import * as BufferNode from "../../bufferNode.js";

describe("Buffer isomorphism", () => {
	it("returns the expected implementation", () => {
		// BufferNode should create a native Node.js Buffer instance
		const nodeBuffer = BufferNode.IsoBuffer.from("", "utf8");
		assert.equal(nodeBuffer.constructor.name, "Buffer");

		// BufferBrowser should create our partial Buffer polyfill.
		const browserBuffer = BufferBrowser.IsoBuffer.from("", "utf8");
		assert.equal(browserBuffer.constructor.name, "IsoBuffer");
	});

	it("from string utf-8/16 is compatible", () => {
		const testArray = [
			"",
			"asdfasdf", // ascii range
			"比特币", // non-ascii range
			"😂💁🏼‍♂️💁🏼‍💁‍♂", // surrogate pairs with glyph modifiers
			"\u0080\u0080", // invalid sequence of utf-8 continuation codes
			"\uD800", // single utf-16 surrogate without pair
			"\u2962\u0000\uFFFF\uAAAA", // garbage
		];

		for (const item of testArray) {
			const nodeBuffer = BufferNode.IsoBuffer.from(item);
			const browserBuffer = BufferBrowser.IsoBuffer.from(item);

			assert.equal(nodeBuffer.toString(), browserBuffer.toString());
		}

		{
			const nodeBuffer = BufferNode.IsoBuffer.from(testArray[1]);
			const browserBuffer = BufferBrowser.IsoBuffer.from(testArray[1]);
			assert.equal(nodeBuffer.toString("utf8"), browserBuffer.toString("utf8"));
			// eslint-disable-next-line unicorn/text-encoding-identifier-case
			assert.equal(nodeBuffer.toString("utf-8"), browserBuffer.toString("utf-8"));
		}
	});

	it("from string base64 is compatible", () => {
		const testArray = [
			"",
			"aa_/-",
			"a==",
			"a=======",
			"äa=bb==cc==",
			"Not A Base64 String 🤪",
			"YXNkZmFzZGY=", // asdfasdf
			"5q+U54m55biB", // 比特币
			"8J+YgvCfkoHwn4+84oCN4pmC77iP8J+SgfCfj7zigI3wn5KB4oCN4pmC", // 😂💁🏼‍♂️💁🏼‍💁‍♂
		];

		for (const item of testArray) {
			const nodeBuffer = BufferNode.IsoBuffer.from(item, "base64");
			const browserBuffer = BufferBrowser.IsoBuffer.from(item, "base64");

			assert.equal(nodeBuffer.toString("base64"), browserBuffer.toString("base64"));
		}
	});

	it("from arraybuffer is compatible", () => {
		const testArray = [
			"",
			"asdfasdf", // ascii range
			"比特币", // non-ascii range
			"😂💁🏼‍♂️💁🏼‍💁‍♂", // surrogate pairs with glyph modifiers
		];

		for (const item of testArray) {
			const encoded = new TextEncoder().encode(item).buffer;
			const nodeBuffer = BufferNode.IsoBuffer.from(encoded);
			const browserBuffer = BufferBrowser.IsoBuffer.from(encoded);

			assert.equal(nodeBuffer.toString(), browserBuffer.toString());
		}
	});

	it("utf8 base64 conversion is compatible", () => {
		const testArrayUtf8 = [
			"",
			"asdfasdf", // ascii range
			"比特币", // non-ascii range
			"😂💁🏼‍♂️💁🏼‍💁‍♂", // surrogate pairs with glyph modifiers
		];

		const testArrayBase64 = [
			"",
			"YXNkZmFzZGY=", // asdfasdf
			"5q+U54m55biB", // 比特币
			"8J+YgvCfkoHwn4+84oCN4pmC77iP8J+SgfCfj7zigI3wn5KB4oCN4pmC", // 😂💁🏼‍♂️💁🏼‍💁‍♂
		];

		for (let i = 0; i < testArrayUtf8.length; i++) {
			const nodeBuffer1 = BufferNode.IsoBuffer.from(testArrayUtf8[i]);
			assert.equal(nodeBuffer1.toString("base64"), testArrayBase64[i]);

			const nodeBuffer2 = BufferNode.IsoBuffer.from(nodeBuffer1.toString("base64"), "base64");
			assert.equal(nodeBuffer2.toString(), testArrayUtf8[i]);

			const browserBuffer1 = BufferBrowser.IsoBuffer.from(testArrayUtf8[i]);
			assert.equal(browserBuffer1.toString("base64"), testArrayBase64[i]);

			const browserBuffer2 = BufferBrowser.IsoBuffer.from(
				browserBuffer1.toString("base64"),
				"base64",
			);
			assert.equal(browserBuffer2.toString(), testArrayUtf8[i]);
		}
	});

	it("bytelength is compatible", () => {
		const testString = "8J+YgvCfkoHwn4+84oCN4pmC77iP8J+SgfCfj7zigI3wn5KB4oCN4pmC";

		const nodeBufferUtf8 = BufferNode.IsoBuffer.from(testString);
		const browserBufferUtf8 = BufferBrowser.IsoBuffer.from(testString);
		assert.equal(nodeBufferUtf8.byteLength, browserBufferUtf8.byteLength);

		const nodeBufferBase64 = BufferNode.IsoBuffer.from(testString, "base64");
		const browserBufferBase64 = BufferBrowser.IsoBuffer.from(testString, "base64");
		assert.equal(nodeBufferBase64.byteLength, browserBufferBase64.byteLength);
	});

	it("Views are supported", () => {
		const testArray = [
			"",
			"asdfasdf", // ascii range
			"比特币", // non-ascii range
			"😂💁🏼‍♂️💁🏼‍💁‍♂", // surrogate pairs with glyph modifiers
		];

		for (const item of testArray) {
			const encoded = new TextEncoder().encode(`aa${item}bb`).buffer;
			const view = new Uint8Array(encoded, 2, encoded.byteLength - 4);
			const nodeBuffer = BufferNode.IsoBuffer.from(view);
			const browserBuffer = BufferBrowser.IsoBuffer.from(view);

			assert.equal(nodeBuffer.toString(), browserBuffer.toString());

			const encodedWithoutView = new TextEncoder().encode(item).buffer;
			const nodeBufferWithoutView = BufferNode.IsoBuffer.from(encodedWithoutView);
			const browserBufferWithoutView = BufferBrowser.IsoBuffer.from(encodedWithoutView);

			assert.equal(nodeBufferWithoutView.toString("base64"), nodeBuffer.toString("base64"));
			assert.equal(
				browserBufferWithoutView.toString("base64"),
				browserBuffer.toString("base64"),
			);

			assert.equal(nodeBufferWithoutView.toString("utf8"), nodeBuffer.toString("utf8"));
			assert.equal(browserBufferWithoutView.toString("utf8"), browserBuffer.toString("utf8"));

			assert.equal(nodeBufferWithoutView.byteLength, nodeBuffer.byteLength);
			assert.equal(browserBufferWithoutView.byteLength, browserBuffer.byteLength);

			assert.equal(
				BufferNode.bufferToString(nodeBufferWithoutView, "base64"),
				BufferNode.bufferToString(nodeBuffer, "base64"),
			);
			assert.equal(
				BufferBrowser.bufferToString(browserBufferWithoutView, "base64"),
				BufferBrowser.bufferToString(browserBuffer, "base64"),
			);

			assert.equal(
				BufferNode.bufferToString(nodeBufferWithoutView, "utf8"),
				BufferNode.bufferToString(nodeBuffer, "utf8"),
			);
			assert.equal(
				BufferBrowser.bufferToString(browserBufferWithoutView, "utf8"),
				BufferBrowser.bufferToString(browserBuffer, "utf8"),
			);
		}
	});

	it("Ranges parameters are ignored when passing views", () => {
		const testArray = [
			"", // The specified view lies outside of the string
			"abcdefg", // The specified view lies within the string
		];

		for (const item of testArray) {
			const encoded = new TextEncoder().encode(`aa${item}bb`).buffer;

			const uint8View = new Uint8Array(encoded, 2, encoded.byteLength - 4);

			const fullBuffer = BufferNode.IsoBuffer.from(uint8View);

			const subsetUInt8ViewNode = BufferNode.IsoBuffer.from(uint8View, 2, 4);
			const subsetFullBufferNode = BufferNode.IsoBuffer.from(fullBuffer, 2, 4);
			assert.equal(fullBuffer.toString(), subsetUInt8ViewNode.toString());
			assert.equal(fullBuffer.toString(), subsetFullBufferNode.toString());

			const subsetUInt8ViewBrowser = BufferBrowser.IsoBuffer.from(uint8View, 2, 4);
			const subsetFullBufferBrowser = BufferBrowser.IsoBuffer.from(fullBuffer, 2, 4);
			assert.equal(fullBuffer.toString(), subsetUInt8ViewBrowser.toString());
			assert.equal(fullBuffer.toString(), subsetFullBufferBrowser.toString());
		}
	});

	it("Uint8ArrayToString is compatible", () => {
		const testArray = new Uint8Array([1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377]);

		const nodeStringUtf8 = BufferNode.Uint8ArrayToString(testArray, "utf8");
		const browserStringUtf8 = BufferBrowser.Uint8ArrayToString(testArray, "utf8");
		assert.equal(nodeStringUtf8, browserStringUtf8);

		const nodeStringBase64 = BufferNode.Uint8ArrayToString(testArray, "base64");
		const browserStringBase64 = BufferBrowser.Uint8ArrayToString(testArray, "base64");
		assert.equal(nodeStringBase64, browserStringBase64);
	});

	it("stringToBuffer is compatible", () => {
		const test = "hello";
		const nodeBufferUtf8 = BufferNode.stringToBuffer(test, "utf8");
		const browserBufferUtf8 = BufferBrowser.stringToBuffer(test, "utf8");
		assert.deepEqual(nodeBufferUtf8, browserBufferUtf8);

		const nodeBufferBase64 = BufferNode.stringToBuffer(test, "base64");
		const browserBufferBase64 = BufferBrowser.stringToBuffer(test, "base64");
		assert.deepEqual(nodeBufferBase64, browserBufferBase64);
	});

	it("bufferToString with utf8 encoding is compatible", () => {
		const test = "hello";
		const nodeBufferUtf8 = BufferNode.stringToBuffer(test, "utf8");
		const browserBufferUtf8 = BufferBrowser.stringToBuffer(test, "utf8");

		const nodeStringUtf8 = BufferNode.bufferToString(nodeBufferUtf8, "utf8");
		const browserStringUtf8 = BufferBrowser.bufferToString(browserBufferUtf8, "utf8");
		assert.equal(nodeStringUtf8, browserStringUtf8);
		assert.equal(nodeStringUtf8, test);
		assert.equal(browserStringUtf8, test);

		const nodeStringBase64 = BufferNode.bufferToString(nodeBufferUtf8, "base64");
		const browserStringBase64 = BufferBrowser.bufferToString(browserBufferUtf8, "base64");
		assert.equal(nodeStringBase64, browserStringBase64);
		assert.equal(nodeStringBase64, "aGVsbG8=");
		assert.equal(browserStringBase64, "aGVsbG8=");
	});

	it("bufferToString with base64 encoding is compatible", () => {
		const test = "aGVsbG90aGVyZQ==";
		const nodeBufferBase64 = BufferNode.stringToBuffer(test, "base64");
		const browserBufferBase64 = BufferBrowser.stringToBuffer(test, "base64");

		const nodeStringBase64 = BufferNode.bufferToString(nodeBufferBase64, "base64");
		const browserStringBase64 = BufferBrowser.bufferToString(browserBufferBase64, "base64");
		assert.equal(nodeStringBase64, browserStringBase64);
		assert.equal(nodeStringBase64, test);
		assert.equal(browserStringBase64, test);

		const nodeStringUtf8 = BufferNode.bufferToString(nodeBufferBase64, "utf8");
		const browserStringUtf8 = BufferBrowser.bufferToString(browserBufferBase64, "utf8");
		assert.equal(nodeStringUtf8, browserStringUtf8);
		assert.equal(nodeStringUtf8, "hellothere");
		assert.equal(browserStringUtf8, "hellothere");
	});

	it("bufferToString working with IsoBuffer", () => {
		const test = "aGVsbG90aGVyZQ==";

		const browserBuffer = BufferBrowser.IsoBuffer.from(test, "base64");
		assert.equal(BufferBrowser.bufferToString(browserBuffer, "base64"), test);
		// eslint-disable-next-line unicorn/text-encoding-identifier-case -- this value is supported, just discouraged
		assert.equal(BufferBrowser.bufferToString(browserBuffer, "utf-8"), "hellothere");

		const nodeBuffer = BufferNode.IsoBuffer.from(test, "base64");
		assert.equal(BufferNode.bufferToString(nodeBuffer, "base64"), test);
		// eslint-disable-next-line unicorn/text-encoding-identifier-case -- this value is supported, just discouraged
		assert.equal(BufferNode.bufferToString(nodeBuffer, "utf-8"), "hellothere");
	});
});
