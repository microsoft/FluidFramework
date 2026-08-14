/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Distills an ArrayBuffer from an ArrayBufferLike or creates one from SharedArrayBuffer if needed.
 *
 * @param buffer - ArrayBuffer or any ArrayBufferLike to convert to ArrayBuffer.
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
	// eslint-disable-next-line unicorn/prefer-spread -- spread is not the same as slice for Uint8Array
	return new Uint8Array(buffer).slice().buffer;
}

/**
 * Distills a Uint8Array array to an ArrayBuffer | SharedArrayBuffer copying
 * data as needed per the array's byteOffset and byteLength.
 *
 * @param array - Array to extract buffer from.
 *
 * @remarks The returned buffer may be the input array's backing buffer or a copy of its bytes.
 * Callers should not mutate the returned buffer unless they own the input array and its backing
 * storage, and should not rely on mutations being reflected in the input array.
 *
 * @internal
 */
export function Uint8ArrayToArrayBufferLike<TArrayBuffer extends ArrayBufferLike>(
	array: Uint8Array<TArrayBuffer>,
): TArrayBuffer {
	if (array.byteOffset === 0 && array.byteLength === array.buffer.byteLength) {
		return array.buffer;
	}
	// Both ArrayBuffer and SharedArrayBuffer have a slice method and will return
	// their same type, but TypeScript does not correctly determine that will
	// satisfy TArrayBuffer. Cast to TArrayBuffer to indicate that.
	return array.buffer.slice(
		array.byteOffset,
		array.byteOffset + array.byteLength,
	) as TArrayBuffer;
}

/**
 * Distills a Uint8Array array to an ArrayBuffer copying data as needed per the array's
 * byteOffset and byteLength or if underlying buffer is not ArrayBuffer.
 *
 * @param array - Array to convert to ArrayBuffer.
 *
 * @remarks The returned buffer may be the input array's backing buffer or a copy of its bytes.
 * Callers should not mutate the returned buffer unless they own the input array and its backing
 * storage, and should not rely on mutations being reflected in the input array.
 *
 * Prefer to use Uint8ArrayToArrayBufferLike if callsite doesn't require
 * an explicit ArrayBuffer (can also handle SharedArrayBuffer).
 *
 * @internal
 */
export function AnyUint8ArrayToArrayBuffer(array: Uint8Array): ArrayBuffer {
	if (
		array.buffer instanceof ArrayBuffer &&
		array.byteOffset === 0 &&
		array.byteLength === array.buffer.byteLength
	) {
		return array.buffer;
	}
	return array.slice(array.byteOffset, array.byteOffset + array.byteLength).buffer;
}
