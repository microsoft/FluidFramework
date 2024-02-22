"use strict";
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.bufferToString = exports.stringToBuffer = exports.Uint8ArrayToString = exports.IsoBuffer = void 0;
/**
 * @internal
 */
exports.IsoBuffer = Buffer;
/**
 * Converts a Uint8Array to a string of the provided encoding.
 * @remarks Useful when the array might be an IsoBuffer.
 * @param arr - The array to convert.
 * @param encoding - Optional target encoding; only "utf8" and "base64" are
 * supported, with "utf8" being default.
 * @returns The converted string.
 *
 * @internal
 */
function Uint8ArrayToString(arr, 
// eslint-disable-next-line unicorn/text-encoding-identifier-case -- this value is supported, just discouraged
encoding) {
    // Buffer extends Uint8Array.  Therefore, 'arr' may already be a Buffer, in
    // which case we can avoid copying the Uint8Array into a new Buffer instance.
    return (Buffer.isBuffer(arr) ? arr : Buffer.from(arr)).toString(encoding);
}
exports.Uint8ArrayToString = Uint8ArrayToString;
/**
 * Convert base64 or utf8 string to array buffer.
 * @param encoding - The input string's encoding.
 *
 * @internal
 */
function stringToBuffer(input, encoding) {
    const iso = exports.IsoBuffer.from(input, encoding);
    // In a Node environment, IsoBuffer may be a Node.js Buffer.  Node.js will
    // pool multiple small Buffer instances into a single ArrayBuffer, in which
    // case we need to slice the appropriate span of bytes.
    return iso.byteLength === iso.buffer.byteLength
        ? iso.buffer
        : iso.buffer.slice(iso.byteOffset, iso.byteOffset + iso.byteLength);
}
exports.stringToBuffer = stringToBuffer;
/**
 * Convert binary blob to string format
 *
 * @param blob - The binary blob
 * @param encoding - Output string's encoding
 * @returns The blob in string format
 *
 * @alpha
 */
const bufferToString = (blob, 
// eslint-disable-next-line unicorn/text-encoding-identifier-case -- this value is supported, just discouraged
encoding) => exports.IsoBuffer.from(blob).toString(encoding);
exports.bufferToString = bufferToString;
//# sourceMappingURL=bufferNode.js.map