/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as base64js from "base64-js";

/**
 * Converts a Uint8Array to a string of the provided encoding
 * Useful when the array might be an IsoBuffer
 * @param arr - The array to convert
 * @param encoding - Optional target encoding; only "utf8" and "base64" are
 * supported, with "utf8" being default
 * @returns The converted string
 */
export function Uint8ArrayToString(arr: Uint8Array, encoding?: string): string {
    switch (encoding) {
        case "base64": {
            return base64js.fromByteArray(arr);
        }
        case "utf8":
        case "utf-8":
        case undefined: {
            return new TextDecoder().decode(arr);
        }
        default: {
            throw new Error("invalid/unsupported encoding");
        }
    }
}

/**
 * Convert base64 or utf8 string to array buffer
 */
export const stringToBuffer = (input: string, encoding: string): ArrayBufferLike =>
    IsoBuffer.from(input, encoding).buffer;

/**
 * Convert binary blob to string format
 *
 * @param blob - the binary blob
 * @returns the blob in string format
 */
export const bufferToString = (blob: ArrayBufferLike, encoding: string): string =>
     IsoBuffer.from(blob).toString(encoding);

/**
 * Minimal implementation of Buffer for our usages in the browser environment.
 */
export class IsoBuffer extends Uint8Array {
    // Need to have ctor for it to be in proto chain for instanceof check in from() method to work
    public constructor(buffer: ArrayBufferLike, byteOffset?: number, length?: number) {
        super(buffer, byteOffset, length);
    }

    /**
     * Convert the buffer to a string.
     * Only supports encoding the whole string (unlike the Node Buffer equivalent)
     * and only utf8 and base64 encodings
     * @param encoding
     */
    public toString(encoding?: string): string {
        return Uint8ArrayToString(this, encoding);
    }

    /**
     * @param value - string | ArrayBuffer
     * @param encodingOrOffset - string | number
     * @param length - number
     */
    static from(value, encodingOrOffset?, length?): IsoBuffer {
        if (typeof value === "string") {
            return IsoBuffer.fromString(value, encodingOrOffset as string | undefined);
        } else if (value instanceof IsoBuffer) {
            return value;
        } else if (value instanceof ArrayBuffer) {
            return IsoBuffer.fromArrayBuffer(value, encodingOrOffset as number | undefined, length);
        } else {
            throw new TypeError();
        }
    }

    static fromArrayBuffer(arrayBuffer: ArrayBuffer, byteOffset?: number, byteLength?: number): IsoBuffer {
        const offset = byteOffset ?? 0;
        const validLength = byteLength ?? arrayBuffer.byteLength - offset;
        if (offset < 0 ||
            offset > arrayBuffer.byteLength ||
            validLength < 0 ||
            validLength + offset > arrayBuffer.byteLength) {
            throw new RangeError();
        }

        return new IsoBuffer(arrayBuffer, offset, validLength);
    }

    static fromString(str: string, encoding?: string): IsoBuffer {
        switch (encoding) {
            case "base64": {
                const sanitizedString = this.sanitizeBase64(str);
                const encoded = base64js.toByteArray(sanitizedString);
                return new IsoBuffer(encoded.buffer);
            }
            case "utf8":
            case "utf-8":
            case undefined: {
                const encoded = new TextEncoder().encode(str);
                return new IsoBuffer(encoded.buffer);
            }
            default: {
                throw new Error("invalid/unsupported encoding");
            }
        }
    }

    static isBuffer(obj: any): boolean {
        throw new Error("unimplemented");
    }

    /**
     * Sanitize a base64 string to provide to base64-js library.  base64-js
     * is not as tolerant of the same malformed base64 as Node's Buffer is.
     * @param str
     */
    private static sanitizeBase64(str: string): string {
        let sanitizedStr = str;
        // Remove everything after padding - Node buffer ignores everything
        // after any padding whereas base64-js does not
        sanitizedStr = sanitizedStr.split("=")[0];

        // Remove invalid characters - Node buffer strips invalid characters
        // whereas base64-js replaces them with "A"
        sanitizedStr = sanitizedStr.replace(/[^\w+-/]/g, "");

        // Check for missing padding - Node buffer tolerates missing padding
        // whereas base64-js does not
        if (sanitizedStr.length % 4 !== 0) {
            const paddingArray = ["", "===", "==", "="];
            sanitizedStr += paddingArray[sanitizedStr.length % 4];
        }
        return sanitizedStr;
    }
}
