"use strict";
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Uint8ArrayToArrayBuffer = void 0;
/**
 * Converts a Uint8Array array to an ArrayBuffer.
 * @param array - Array to convert to ArrayBuffer.
 *
 * @internal
 */
function Uint8ArrayToArrayBuffer(array) {
    if (array.byteOffset === 0 && array.byteLength === array.buffer.byteLength) {
        return array.buffer;
    }
    return array.buffer.slice(array.byteOffset, array.byteOffset + array.byteLength);
}
exports.Uint8ArrayToArrayBuffer = Uint8ArrayToArrayBuffer;
//# sourceMappingURL=bufferShared.js.map