/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { runInNewContext } from "vm";

import * as browser from "../../bufferBrowser.js";
import * as node from "../../bufferNode.js";
import { Uint8ArrayToArrayBuffer } from "../../bufferShared.js";

describe("Buffer conversions", () => {
	it("reuses a complete ArrayBuffer", () => {
		const bytes = new Uint8Array([1, 2, 3]);
		assert.strictEqual(Uint8ArrayToArrayBuffer(bytes), bytes.buffer);
	});

	it("reuses a complete ArrayBuffer from another realm", () => {
		const bytes: Uint8Array = runInNewContext("new Uint8Array([1, 2, 3])");
		assert.strictEqual(Uint8ArrayToArrayBuffer(bytes), bytes.buffer);
	});

	it("copies shared storage from another realm", () => {
		const bytes: Uint8Array = runInNewContext("new Uint8Array(new SharedArrayBuffer(3))");
		bytes.set([1, 2, 3]);
		const result = Uint8ArrayToArrayBuffer(bytes);
		assert(result instanceof ArrayBuffer);
		assert.deepEqual(new Uint8Array(result), new Uint8Array([1, 2, 3]));
	});

	it("copies only the bytes of an ArrayBuffer view", () => {
		const bytes = new Uint8Array([1, 2, 3, 4]);
		const result = Uint8ArrayToArrayBuffer(bytes.subarray(1, 3));
		assert.notStrictEqual(result, bytes.buffer);
		assert.deepEqual(new Uint8Array(result), new Uint8Array([2, 3]));
	});

	for (const subview of [false, true]) {
		it(`copies shared storage${subview ? " within a view" : ""} into an ArrayBuffer`, () => {
			const bytes = new Uint8Array(new SharedArrayBuffer(4));
			bytes.set([1, 2, 3, 4]);
			const view = subview ? bytes.subarray(1, 3) : bytes;
			const result = Uint8ArrayToArrayBuffer(view);
			assert(result instanceof ArrayBuffer);
			assert.deepEqual(new Uint8Array(result), new Uint8Array(view));
			bytes.fill(0);
			assert.deepEqual(
				new Uint8Array(result),
				new Uint8Array(subview ? [2, 3] : [1, 2, 3, 4]),
			);
		});
	}

	for (const [name, implementation] of [
		["browser", browser],
		["node", node],
	] as const) {
		it(`${name} converts typed-array views without including surrounding bytes`, () => {
			const bytes = new Uint8Array([0, 65, 66, 67, 0]);
			assert.equal(implementation.bufferToString(bytes.subarray(1, 4), "utf8"), "ABC");
			assert.equal(implementation.bufferToString(bytes.subarray(1, 4), "base64"), "QUJD");
		});

		it(`${name} decodes base64`, () => {
			assert.deepEqual(
				implementation.IsoBuffer.from("AAECA/8=", "base64"),
				implementation.IsoBuffer.from(new Uint8Array([0, 1, 2, 3, 255])),
			);
		});
	}
});
