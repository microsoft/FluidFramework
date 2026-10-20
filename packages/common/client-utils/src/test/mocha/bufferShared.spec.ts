/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { Buffer } from "node:buffer";

import { bufferToString } from "../../bufferNode.js";
import {
	AnyUint8ArrayToArrayBuffer,
	ArrayBufferLikeToArrayBuffer,
	Uint8ArrayToArrayBufferLike,
} from "../../bufferShared.js";

const values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function initializeBuffer(buffer: ArrayBufferLike): void {
	new Uint8Array(buffer).set(values);
}

/**
 * Asserts that `buffer` contains exactly `expected`.
 *
 * @remarks Checks `byteLength` first so that a buffer of the wrong size (for example, an entire
 * 8 KiB Node.js `Buffer` pool) produces a concise failure rather than an enormous content diff.
 */
function assertBufferContents(buffer: ArrayBufferLike, expected: readonly number[]): void {
	assert.equal(buffer.byteLength, expected.length, "unexpected byteLength");
	assert.deepEqual([...new Uint8Array(buffer)], expected);
}

describe("bufferShared", () => {
	describe("ArrayBufferLikeToArrayBuffer", () => {
		it("returns an ArrayBuffer without copying it", () => {
			const source = new ArrayBuffer(values.length);
			initializeBuffer(source);

			const result = ArrayBufferLikeToArrayBuffer(source);
			assert.equal(result, source);
			assertBufferContents(result, values);

			new Uint8Array(source)[0] = 10;
			assertBufferContents(result, [10, ...values.slice(1)]);
		});

		it("copies a SharedArrayBuffer into an ArrayBuffer", () => {
			const source = new SharedArrayBuffer(values.length);
			initializeBuffer(source);

			const result = ArrayBufferLikeToArrayBuffer(source);
			assert(result instanceof ArrayBuffer);
			assertBufferContents(result, values);

			new Uint8Array(source)[0] = 10;
			assertBufferContents(result, values);
		});
	});

	/**
	 * Node.js `Buffer` overrides `slice` to return a view over the same memory rather than a copy,
	 * and small `Buffer`s are commonly allocated from a shared pool. These tests ensure the helpers
	 * only ever surface the bytes logically owned by the input view.
	 */
	describe("Node.js Buffer inputs", () => {
		/**
		 * Regression test: `AnyUint8ArrayToArrayBuffer` previously used `array.slice().buffer`,
		 * which for a Node.js `Buffer` returned the entire underlying buffer (which may be larger
		 * than the portion owned by the input view) instead of a copy of only the logical bytes.
		 */
		it("AnyUint8ArrayToArrayBuffer preserves blob contents from a Node.js Buffer view", () => {
			const content = JSON.stringify({ value: "payload" });
			// Surround `content` with filler bytes on both sides so the view neither starts at
			// offset 0 nor extends to the end of its backing buffer.
			const paddingByteLength = 8;
			const backing = Buffer.alloc(content.length + 2 * paddingByteLength, "!");
			backing.write(content, paddingByteLength, "utf8");
			const nodeView = backing.subarray(paddingByteLength, paddingByteLength + content.length);
			const browserView = new Uint8Array(
				nodeView.buffer,
				nodeView.byteOffset,
				nodeView.byteLength,
			);

			const browserResult = AnyUint8ArrayToArrayBuffer(browserView);
			assert.equal(browserResult.byteLength, browserView.byteLength);
			assert.equal(bufferToString(browserResult, "utf8"), content);

			const result = AnyUint8ArrayToArrayBuffer(nodeView);
			assert.equal(result.byteLength, nodeView.byteLength);
			assert.equal(bufferToString(result, "utf8"), content);
		});

		it("AnyUint8ArrayToArrayBuffer copies only the logical bytes of a pooled Node.js Buffer", () => {
			const content = "pooled";
			const pooled = Buffer.from(content, "utf8");
			// Precondition: small Buffers are allocated from a larger shared pool.
			assert(pooled.buffer.byteLength > pooled.byteLength);

			const result = AnyUint8ArrayToArrayBuffer(pooled);
			assert.equal(result.byteLength, pooled.byteLength);
			assert(result !== pooled.buffer, "result must not be the shared pool buffer");
			assert.equal(bufferToString(result, "utf8"), content);
		});

		it("AnyUint8ArrayToArrayBuffer result does not alias a partial Node.js Buffer view", () => {
			const backing = Buffer.from(values);
			const view = backing.subarray(2, 7);

			const result = AnyUint8ArrayToArrayBuffer(view);
			assertBufferContents(result, [2, 3, 4, 5, 6]);

			view[0] = 20;
			backing[backing.length - 1] = 90;
			assertBufferContents(result, [2, 3, 4, 5, 6]);
		});

		it("AnyUint8ArrayToArrayBuffer returns the backing buffer of an unpooled full Node.js Buffer", () => {
			const unpooled = Buffer.alloc(values.length);
			unpooled.set(values);
			// Precondition: `Buffer.alloc` does not use the shared pool.
			assert.equal(unpooled.byteOffset, 0);
			assert.equal(unpooled.buffer.byteLength, unpooled.byteLength);

			const result = AnyUint8ArrayToArrayBuffer(unpooled);
			assert.equal(result, unpooled.buffer);
			assertBufferContents(result, values);
		});

		it("Uint8ArrayToArrayBufferLike copies only the logical bytes of a pooled Node.js Buffer", () => {
			const content = "pooled";
			const pooled = Buffer.from(content, "utf8");
			assert(pooled.buffer.byteLength > pooled.byteLength);

			const result = Uint8ArrayToArrayBufferLike(pooled);
			assert.equal(result.byteLength, pooled.byteLength);
			assert(result !== pooled.buffer, "result must not be the shared pool buffer");
			assert.equal(bufferToString(result, "utf8"), content);
		});
	});

	for (const [name, createBuffer] of [
		["ArrayBuffer", (length: number): ArrayBufferLike => new ArrayBuffer(length)],
		["SharedArrayBuffer", (length: number): ArrayBufferLike => new SharedArrayBuffer(length)],
	] as const) {
		describe(`Uint8Array backed by ${name}`, () => {
			it("Uint8ArrayToArrayBufferLike extracts ArrayBufferLike from a view of the entire buffer", () => {
				const source = createBuffer(values.length);
				initializeBuffer(source);
				const view = new Uint8Array(source);

				const result = Uint8ArrayToArrayBufferLike(view);
				assert.equal(result, source);
				assertBufferContents(result, values);

				view[0] = 10;
				assertBufferContents(result, [10, ...values.slice(1)]);
			});

			it("Uint8ArrayToArrayBufferLike extracts ArrayBufferLike from a partial view", () => {
				const source = createBuffer(values.length);
				initializeBuffer(source);
				const view = new Uint8Array(source, 2, 5);

				const result = Uint8ArrayToArrayBufferLike(view);
				assert.notEqual(result, source);
				assertBufferContents(result, [2, 3, 4, 5, 6]);

				view[0] = 20;
				assertBufferContents(result, [2, 3, 4, 5, 6]);
			});

			it("AnyUint8ArrayToArrayBuffer extracts ArrayBuffer from a view of the entire buffer", () => {
				const source = createBuffer(values.length);
				initializeBuffer(source);
				const view = new Uint8Array(source);

				const result = AnyUint8ArrayToArrayBuffer(view);
				if (name === "ArrayBuffer") {
					assert.equal(result, source);
				}
				assert(result instanceof ArrayBuffer);
				assertBufferContents(result, values);

				view[0] = 10;
				assertBufferContents(
					result,
					name === "ArrayBuffer" ? [10, ...values.slice(1)] : values,
				);
			});

			it("AnyUint8ArrayToArrayBuffer extracts ArrayBuffer from a partial view", () => {
				const source = createBuffer(values.length);
				initializeBuffer(source);
				const view = new Uint8Array(source, 2, 5);

				const result = AnyUint8ArrayToArrayBuffer(view);
				assert.notEqual(result, source);
				assert(result instanceof ArrayBuffer);
				assertBufferContents(result, [2, 3, 4, 5, 6]);

				view[0] = 20;
				assertBufferContents(result, [2, 3, 4, 5, 6]);
			});
		});
	}
});
