/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Convert Uint8Array array to ArrayBuffer
 * @param array - array to convert to ArrayBuffer
 */
export function Uint8ArrayToArrayBuffer(array: Uint8Array): ArrayBuffer {
    if (array.byteOffset === 0 && array.byteLength === array.buffer.byteLength) {
        return array.buffer;
    }
    return array.buffer.slice(array.byteOffset, array.byteOffset + array.byteLength);
}
