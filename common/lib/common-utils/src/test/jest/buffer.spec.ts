/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as BufferBrowser from "../../bufferBrowser";
import * as BufferNode from "../../bufferNode";

describe("Buffer isomorphism", () => {
	test("from string utf-8/16 is compatible", () => {
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

			expect(nodeBuffer.toString()).toEqual(browserBuffer.toString());
		}

		{
			const nodeBuffer = BufferNode.IsoBuffer.from(testArray[1]);
			const browserBuffer = BufferBrowser.IsoBuffer.from(testArray[1]);
			expect(nodeBuffer.toString("utf8")).toEqual(browserBuffer.toString("utf8"));
			expect(nodeBuffer.toString("utf-8")).toEqual(browserBuffer.toString("utf-8"));
		}
	});

	test("from string base64 is compatible", () => {
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

			expect(nodeBuffer.toString("base64")).toEqual(browserBuffer.toString("base64"));
		}
	});

	test("from arraybuffer is compatible", () => {
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

			expect(nodeBuffer.toString()).toEqual(browserBuffer.toString());
		}
	});

	test("utf8 base64 conversion is compatible", () => {
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
			expect(nodeBuffer1.toString("base64")).toEqual(testArrayBase64[i]);

			const nodeBuffer2 = BufferNode.IsoBuffer.from(nodeBuffer1.toString("base64"), "base64");
			expect(nodeBuffer2.toString()).toEqual(testArrayUtf8[i]);

			const browserBuffer1 = BufferBrowser.IsoBuffer.from(testArrayUtf8[i]);
			expect(browserBuffer1.toString("base64")).toEqual(testArrayBase64[i]);

			const browserBuffer2 = BufferBrowser.IsoBuffer.from(
				browserBuffer1.toString("base64"),
				"base64",
			);
			expect(browserBuffer2.toString()).toEqual(testArrayUtf8[i]);
		}
	});

	test("bytelength is compatible", () => {
		const testString = "8J+YgvCfkoHwn4+84oCN4pmC77iP8J+SgfCfj7zigI3wn5KB4oCN4pmC";

		const nodeBufferUtf8 = BufferNode.IsoBuffer.from(testString);
		const browserBufferUtf8 = BufferBrowser.IsoBuffer.from(testString);
		expect(nodeBufferUtf8.byteLength).toEqual(browserBufferUtf8.byteLength);

		const nodeBufferBase64 = BufferNode.IsoBuffer.from(testString, "base64");
		const browserBufferBase64 = BufferBrowser.IsoBuffer.from(testString, "base64");
		expect(nodeBufferBase64.byteLength).toEqual(browserBufferBase64.byteLength);
	});

	test("Views are supported", () => {
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

			expect(nodeBuffer.toString()).toEqual(browserBuffer.toString());

			const encodedWithoutView = new TextEncoder().encode(item).buffer;
			const nodeBufferWithoutView = BufferNode.IsoBuffer.from(encodedWithoutView);
			const browserBufferWithoutView = BufferNode.IsoBuffer.from(encodedWithoutView);

			expect(nodeBufferWithoutView.toString("base64")).toEqual(nodeBuffer.toString("base64"));
			expect(browserBufferWithoutView.toString("base64")).toEqual(
				browserBuffer.toString("base64"),
			);

			expect(nodeBufferWithoutView.toString("utf8")).toEqual(nodeBuffer.toString("utf8"));
			expect(browserBufferWithoutView.toString("utf8")).toEqual(
				browserBuffer.toString("utf8"),
			);

			expect(nodeBufferWithoutView.byteLength).toEqual(nodeBuffer.byteLength);
			expect(browserBufferWithoutView.byteLength).toEqual(browserBuffer.byteLength);

			expect(BufferNode.bufferToString(nodeBufferWithoutView, "base64")).toEqual(
				BufferNode.bufferToString(nodeBuffer, "base64"),
			);
			expect(BufferBrowser.bufferToString(browserBufferWithoutView, "base64")).toEqual(
				BufferBrowser.bufferToString(browserBuffer, "base64"),
			);

			expect(BufferNode.bufferToString(nodeBufferWithoutView, "utf8")).toEqual(
				BufferNode.bufferToString(nodeBuffer, "utf8"),
			);
			expect(BufferBrowser.bufferToString(browserBufferWithoutView, "utf8")).toEqual(
				BufferBrowser.bufferToString(browserBuffer, "utf8"),
			);
		}
	});

	test("Ranges parameters are ignored when passing views", () => {
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
			expect(fullBuffer.toString()).toEqual(subsetUInt8ViewNode.toString());
			expect(fullBuffer.toString()).toEqual(subsetFullBufferNode.toString());

			const subsetUInt8ViewBrowser = BufferBrowser.IsoBuffer.from(uint8View, 2, 4);
			const subsetFullBufferBrowser = BufferBrowser.IsoBuffer.from(fullBuffer, 2, 4);
			expect(fullBuffer.toString()).toEqual(subsetUInt8ViewBrowser.toString());
			expect(fullBuffer.toString()).toEqual(subsetFullBufferBrowser.toString());
		}
	});

	test("Uint8ArrayToString is compatible", () => {
		const testArray = new Uint8Array([1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377]);

		const nodeStringUtf8 = BufferNode.Uint8ArrayToString(testArray, "utf8");
		const browserStringUtf8 = BufferBrowser.Uint8ArrayToString(testArray, "utf8");
		expect(nodeStringUtf8).toEqual(browserStringUtf8);

		const nodeStringBase64 = BufferNode.Uint8ArrayToString(testArray, "base64");
		const browserStringBase64 = BufferBrowser.Uint8ArrayToString(testArray, "base64");
		expect(nodeStringBase64).toEqual(browserStringBase64);
	});

	test("stringToBuffer is compatible", () => {
		const test = "hello";
		const nodeBufferUtf8 = BufferNode.stringToBuffer(test, "utf8");
		const browserBufferUtf8 = BufferBrowser.stringToBuffer(test, "utf8");
		expect(nodeBufferUtf8).toEqual(browserBufferUtf8);

		const nodeBufferBase64 = BufferNode.stringToBuffer(test, "base64");
		const browserBufferBase64 = BufferBrowser.stringToBuffer(test, "base64");
		expect(nodeBufferBase64).toEqual(browserBufferBase64);
	});

	test("bufferToString with utf8 encoding is compatible", () => {
		const test = "hello";
		const nodeBufferUtf8 = BufferNode.stringToBuffer(test, "utf8");
		const browserBufferUtf8 = BufferBrowser.stringToBuffer(test, "utf8");

		const nodeStringUtf8 = BufferNode.bufferToString(nodeBufferUtf8, "utf8");
		const browserStringUtf8 = BufferBrowser.bufferToString(browserBufferUtf8, "utf8");
		expect(nodeStringUtf8).toEqual(browserStringUtf8);
		expect(nodeStringUtf8).toEqual(test);
		expect(browserStringUtf8).toEqual(test);

		const nodeStringBase64 = BufferNode.bufferToString(nodeBufferUtf8, "base64");
		const browserStringBase64 = BufferBrowser.bufferToString(browserBufferUtf8, "base64");
		expect(nodeStringBase64).toEqual(browserStringBase64);
		expect(nodeStringBase64).toEqual("aGVsbG8=");
		expect(browserStringBase64).toEqual("aGVsbG8=");
	});

	test("bufferToString with base64 encoding is compatible", () => {
		const test = "aGVsbG90aGVyZQ==";
		const nodeBufferBase64 = BufferNode.stringToBuffer(test, "base64");
		const browserBufferBase64 = BufferBrowser.stringToBuffer(test, "base64");

		const nodeStringBase64 = BufferNode.bufferToString(nodeBufferBase64, "base64");
		const browserStringBase64 = BufferBrowser.bufferToString(browserBufferBase64, "base64");
		expect(nodeStringBase64).toEqual(browserStringBase64);
		expect(nodeStringBase64).toEqual(test);
		expect(browserStringBase64).toEqual(test);

		const nodeStringUtf8 = BufferNode.bufferToString(nodeBufferBase64, "utf8");
		const browserStringUtf8 = BufferBrowser.bufferToString(browserBufferBase64, "utf8");
		expect(nodeStringUtf8).toEqual(browserStringUtf8);
		expect(nodeStringUtf8).toEqual("hellothere");
		expect(browserStringUtf8).toEqual("hellothere");
	});

	test("bufferToString working with IsoBuffer", () => {
		const test = "aGVsbG90aGVyZQ==";

		const buffer = BufferBrowser.IsoBuffer.from(test, "base64");
		expect(BufferBrowser.bufferToString(buffer, "base64")).toEqual(test);
		expect(BufferBrowser.bufferToString(buffer, "utf-8")).toEqual("hellothere");

		const buffer2 = BufferNode.IsoBuffer.from(test, "base64");
		expect(BufferNode.bufferToString(buffer2, "base64")).toEqual(test);
		expect(BufferNode.bufferToString(buffer2, "utf-8")).toEqual("hellothere");
	});
});
