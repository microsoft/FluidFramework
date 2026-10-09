/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Converts a Uint8Array array to an ArrayBuffer.
 * @remarks Shared backing storage is copied to produce an ArrayBuffer.
 * @param array - Array to convert to ArrayBuffer.
 *
 * @deprecated Moved to the `@fluid-internal/client-utils` package.
 * @internal
 */
export function Uint8ArrayToArrayBuffer(array: Uint8Array): ArrayBuffer {
	if (isSharedArrayBuffer(array.buffer)) {
		return new Uint8Array(array).buffer;
	}
	if (array.byteOffset === 0 && array.byteLength === array.buffer.byteLength) {
		return array.buffer;
	}
	return array.buffer.slice(array.byteOffset, array.byteOffset + array.byteLength);
}

function isSharedArrayBuffer(buffer: ArrayBufferLike): buffer is SharedArrayBuffer {
	// Unlike instanceof, the tag identifies shared buffers from other realms too.
	return buffer[Symbol.toStringTag] === "SharedArrayBuffer";
}
