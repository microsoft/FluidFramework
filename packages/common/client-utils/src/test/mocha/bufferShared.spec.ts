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

function assertBufferContents(buffer: ArrayBufferLike, expected: readonly number[]): void {
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
	 * `AnyUint8ArrayToArrayBuffer` behaves differently between Node and browser targets. In the
	 * browser case, AnyUint8ArrayToArrayBuffer will return a buffer containing only the logical
	 * bytes. In the node case, it returns the underlying buffer which may be larger than the
	 * portion owned by the input object. We effectively forget the input owner.
	 */
	it("AnyUint8ArrayToArrayBuffer preserves blob contents from a Node.js Buffer view", () => {
		const content = JSON.stringify({ value: "payload" });
		const backing = Buffer.alloc(content.length + 16, "!");
		backing.write(content, 8, "utf8");
		const nodeView = backing.subarray(8, 8 + content.length);
		const browserView = new Uint8Array(
			nodeView.buffer,
			nodeView.byteOffset,
			nodeView.byteLength,
		);

		assert.equal(bufferToString(AnyUint8ArrayToArrayBuffer(browserView), "utf8"), content);

		const result = AnyUint8ArrayToArrayBuffer(nodeView);
		assert.equal(bufferToString(result, "utf8"), content);
		assert.equal(result.byteLength, nodeView.byteLength);
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
