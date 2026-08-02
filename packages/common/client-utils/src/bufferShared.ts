/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Converts a Uint8Array array to an ArrayBuffer.
 * @param array - Array to convert to ArrayBuffer.
 *
 * @remarks The returned buffer may be the input array's backing buffer or a copy of its bytes.
 * Callers should not mutate the returned buffer unless they own the input array and its backing
 * storage, and should not rely on mutations being reflected in the input array.
 *
 * @internal
 */
export function Uint8ArrayToArrayBuffer(array: Uint8Array): ArrayBuffer {
	if (array.buffer instanceof ArrayBuffer) {
		if (array.byteOffset === 0 && array.byteLength === array.buffer.byteLength) {
			return array.buffer;
		}
		return array.buffer.slice(array.byteOffset, array.byteOffset + array.byteLength);
	}
	return new Uint8Array(array).buffer;
}
