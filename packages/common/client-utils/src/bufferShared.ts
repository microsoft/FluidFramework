/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Distills an `ArrayBuffer` from an `ArrayBufferLike` or creates one from `SharedArrayBuffer` if needed.
 *
 * @param buffer - `ArrayBuffer` or any `ArrayBufferLike` to convert to `ArrayBuffer`.
 *
 * @remarks The returned buffer may be the input array's backing buffer or a copy of its bytes.
 * Callers should not mutate the returned buffer unless they own the input array and its backing
 * storage, and should not rely on mutations being reflected in the input array.
 *
 * @internal
 */
export function ArrayBufferLikeToArrayBuffer(buffer: ArrayBufferLike): ArrayBuffer {
	if (buffer instanceof ArrayBuffer) {
		return buffer;
	}
	// Use .slice to get `ArrayBuffer` backing that `Blob` requires.
	// Note that `buffer.slice` preserves the underlying buffer type, so we
	// need to use .slice on a `Uint8Array` to ensure we get an `ArrayBuffer`.
	// eslint-disable-next-line unicorn/prefer-spread -- spread is not the same as slice for `Uint8Array`
	return new Uint8Array(buffer).slice().buffer;
}

/**
 * Distills a `Uint8Array` array to an `ArrayBuffer | SharedArrayBuffer` copying
 * data as needed per the array's `byteOffset` and `byteLength` to have a full
 * buffer (no offset and entire length).
 *
 * @param array - Array to extract buffer from.
 *
 * @remarks The returned buffer may be the input array's backing buffer or a copy of its bytes.
 * Callers should not mutate the returned buffer unless they own the input array and its backing
 * storage, and should not rely on mutations being reflected in the input array.
 *
 * @privateRemarks
 * Upon update to TypeScript 5.9 or higher, this should become a generic function
 * over `ArrayBufferLike` that parameterizes `Uint8Array`.
 *
 * @internal
 */
export function Uint8ArrayToArrayBufferLike(array: Uint8Array): ArrayBufferLike {
	if (array.byteOffset === 0 && array.byteLength === array.buffer.byteLength) {
		return array.buffer;
	}
	return array.buffer.slice(array.byteOffset, array.byteOffset + array.byteLength);
}

/**
 * Distills a `Uint8Array` array to an `ArrayBuffer` copying data as needed per the array's
 * `byteOffset` and `byteLength` or if underlying buffer is not `ArrayBuffer`.
 *
 * @param array - Array to convert to `ArrayBuffer`.
 *
 * @remarks The returned buffer may be the input array's backing buffer or a copy of its bytes.
 * Callers should not mutate the returned buffer unless they own the input array and its backing
 * storage, and should not rely on mutations being reflected in the input array.
 *
 * Prefer to use {@link Uint8ArrayToArrayBufferLike} if the call site doesn't require
 * an explicit `ArrayBuffer` (can also handle `SharedArrayBuffer`).
 *
 * @internal
 */
export function AnyUint8ArrayToArrayBuffer(array: Uint8Array): ArrayBuffer {
	// Shortcut to provider underlying buffer as-is when possible.
	if (
		array.byteOffset === 0 &&
		array.byteLength === array.buffer.byteLength &&
		array.buffer instanceof ArrayBuffer
	) {
		return array.buffer;
	}
	// .slice is used to ensure underlying buffer is:
	//  1. ArrayBuffer
	//  2. the complete data (no offset, full length)
	// Cloning specified per https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/slice
	// and ECMAScript https://tc39.es/ecma262/multipage/indexed-collections.html#sec-%typedarray%.prototype.slice.
	// eslint-disable-next-line unicorn/prefer-spread -- spread is not the same as slice for `Uint8Array`
	return array.slice().buffer;
}
