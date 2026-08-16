/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

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

function dataViewFromArrayBufferLike(value: ArrayBufferLike): DataView {
	return new DataView(value);
}

function uint16ArrayFromArrayBufferLike(value: ArrayBufferLike): Uint16Array {
	return new Uint16Array(value);
}

function bufferFromArrayBufferLike(value: ArrayBufferLike): Buffer {
	return Buffer.from(value);
}

describe("bufferShared", () => {
	// These tests can be removed when updating TypeScript and type checks begin to fail as expected.
	describe("TS5.4 unsound typecheck: Uint8Array passed as ArrayBufferLike", () => {
		for (const [name, view] of [
			["full view", new Uint8Array([0, 1, 2, 3, 4, 5])],
			["partial view", new Uint8Array(new Uint8Array([0, 1, 2, 3, 4, 5]).buffer, 2, 2)],
		] as const) {
			it(`new DataView rejects a ${name}`, () => {
				// Self-check - DataView accepts ArrayBufferLike without throwing
				dataViewFromArrayBufferLike(view.buffer);

				// Act and Verify
				assert.throws(
					() => dataViewFromArrayBufferLike(view /* as unknown as ArrayBufferLike */),
					TypeError,
				);
			});

			it(`new Uint16Array interprets a ${name} as elements instead of bytes`, () => {
				// "Expected" is an actual buffer - here it is the full buffer whether
				// the view is partial or full.
				const expected = uint16ArrayFromArrayBufferLike(view.buffer);

				// Act
				const result = uint16ArrayFromArrayBufferLike(
					view /* as unknown as ArrayBufferLike */,
				);

				// Verify
				assert.notEqual(result.length, expected.length);

				// Self-test - the result looks like view
				assert.deepEqual([...result], [...view]);
			});
		}

		it(`Buffer.from copies instead of sharing its storage`, () => {
			const view = new Uint8Array([0, 1, 2, 3, 4, 5]);
			const expected = bufferFromArrayBufferLike(view.buffer);

			// Act
			const result = bufferFromArrayBufferLike(view /* as unknown as ArrayBufferLike */);

			view[0] = 10;
			// Self-test - the expected buffer is backed by the same storage as view (value at 0 changed)
			assert.equal(expected[0], 10);

			// Verify
			assert.notEqual(result[0], 10);
		});
	});

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
