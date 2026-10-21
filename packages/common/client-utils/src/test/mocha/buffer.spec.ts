/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { Buffer } from "node:buffer";

import * as BufferBrowser from "../../bufferBrowser.js";
import * as BufferNode from "../../bufferNode.js";
import { IsoBuffer } from "../../indexNode.js";

describe("IsoBuffer", () => {
	it("is a Buffer", () => {
		// Paranoid test that 'IsoBuffer' can be constructed in both CJS/ESM in Node.js environments.
		// Note that no export remapping is involved, given that 'IsoBuffer' is imported from 'indexNode.js'.
		//
		// More comprehensive testing for 'IsoBuffer' is done in 'jest/buffer.spec.ts', which compares
		// Node.js and Broswer implementations for equivalence.
		assert(
			IsoBuffer.from("", "utf8") instanceof Buffer,
			"Expected IsoBuffer.from to return a native Node.js Buffer instance.",
		);
	});
});

describe("Node.js Buffer regressions", () => {
	it("reproduces an IdCompressor alignment failure from an aliased Node.js Buffer body", () => {
		const serialized = BufferBrowser.bufferToString(
			new Float64Array([2, 0, 0, 0]).buffer,
			"base64",
		);
		const content = JSON.stringify(serialized);
		const nodeBody = BufferNode.IsoBuffer.from(content, "utf8");
		const browserBody = BufferBrowser.IsoBuffer.from(content, "utf8");

		// Fetch shims can use slice(0) to clone typed-array response bodies.
		// eslint-disable-next-line unicorn/prefer-spread -- Exercise the shim's slice semantics.
		const nodeClone = nodeBody.slice(0);
		// eslint-disable-next-line unicorn/prefer-spread -- Exercise the shim's slice semantics.
		const browserClone = browserBody.slice(0);
		nodeBody[9] = 61; // "="
		browserBody[9] = 61;

		const nodeSerialized: unknown = JSON.parse(
			BufferBrowser.Uint8ArrayToString(nodeClone, "utf8"),
		);
		const browserSerialized: unknown = JSON.parse(
			BufferBrowser.Uint8ArrayToString(browserClone, "utf8"),
		);
		assert(typeof nodeSerialized === "string");
		assert(typeof browserSerialized === "string");
		assert.equal(nodeClone.byteLength, browserClone.byteLength);
		assert.equal(browserSerialized, serialized);

		const nodeDecoded = BufferBrowser.stringToBuffer(nodeSerialized, "base64");
		const browserDecoded = BufferBrowser.stringToBuffer(browserSerialized, "base64");
		assert.equal(nodeDecoded.byteLength, 6);
		assert.equal(browserDecoded.byteLength, 32);
		assert.throws(() => new Float64Array(nodeDecoded), {
			name: "RangeError",
			message: "byte length of Float64Array should be a multiple of 8",
		});
		assert.doesNotThrow(() => new Float64Array(browserDecoded));
	});

	describe("partial views over a larger buffer", () => {
		const content = "\u6BD4\u7279\u5E01 payload";
		const padding = "!!!!";
		const backing = Buffer.from(`${padding}${content}${padding}`, "utf8");
		const contentByteLength = Buffer.byteLength(content, "utf8");
		const nodeSubarray = backing.subarray(padding.length, padding.length + contentByteLength);
		const pooled = Buffer.from(content, "utf8");
		const plainView = new Uint8Array(
			nodeSubarray.buffer,
			nodeSubarray.byteOffset,
			nodeSubarray.byteLength,
		);
		const expectedBase64 = Buffer.from(content, "utf8").toString("base64");

		for (const [name, view] of [
			["Node.js Buffer subarray", nodeSubarray],
			["pooled Node.js Buffer", pooled],
			["Uint8Array view", plainView],
		] as const) {
			it(`Uint8ArrayToString respects ${name}`, () => {
				assert(view.buffer.byteLength > view.byteLength);
				assert.equal(BufferNode.Uint8ArrayToString(view, "utf8"), content);
				assert.equal(BufferBrowser.Uint8ArrayToString(view, "utf8"), content);
				assert.equal(BufferNode.Uint8ArrayToString(view, "base64"), expectedBase64);
				assert.equal(BufferBrowser.Uint8ArrayToString(view, "base64"), expectedBase64);
			});

			it(`Node.js IsoBuffer.from copies only the logical bytes of ${name}`, () => {
				assert(view.buffer.byteLength > view.byteLength);
				const copy = BufferNode.IsoBuffer.from(view);
				assert.equal(copy.byteLength, view.byteLength);
				assert.equal(copy.toString("utf8"), content);
				copy.fill(0);
				assert.equal(BufferNode.Uint8ArrayToString(view, "utf8"), content);
			});
		}
	});

	it("stringToBuffer returns only the encoded bytes for pooled Node.js Buffers", () => {
		for (const { input, encoding, expectedByteLength } of [
			{ input: "hello", encoding: "utf8", expectedByteLength: 5 },
			{ input: "\u6BD4\u7279\u5E01", encoding: "utf8", expectedByteLength: 9 },
			{ input: "aGVsbG8=", encoding: "base64", expectedByteLength: 5 },
		] as const) {
			const pooled = BufferNode.IsoBuffer.from(input, encoding);
			assert(pooled.buffer.byteLength > pooled.byteLength);

			const nodeBuffer = BufferNode.stringToBuffer(input, encoding);
			const browserBuffer = BufferBrowser.stringToBuffer(input, encoding);
			assert.equal(nodeBuffer.byteLength, expectedByteLength);
			assert.equal(browserBuffer.byteLength, expectedByteLength);
			assert.deepEqual(new Uint8Array(nodeBuffer), new Uint8Array(browserBuffer));
			assert.equal(BufferNode.bufferToString(nodeBuffer, encoding), input);
		}
	});
});
