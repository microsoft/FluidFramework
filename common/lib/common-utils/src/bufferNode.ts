/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Declare the subset of Buffer functionality we want to make available instead of
 * exposing the entirely of Node's typings.  This should match the public interface
 * of the browser implementation, so any changes made in one should be made in both.
 */
export declare class Buffer extends Uint8Array {
    toString(encoding?: string): string;
    /**
     * @param value - string | ArrayBuffer
     * @param encodingOrOffset - string | number
     * @param length - number
     */
    static from(value, encodingOrOffset?, length?): IsoBuffer;
    static isBuffer(obj: any): obj is Buffer;
}
export const IsoBuffer = Buffer;
export type IsoBuffer = Buffer;

/**
 * Converts a Uint8Array to a string of the provided encoding
 * Useful when the array might be an IsoBuffer
 * @param arr - The array to convert
 * @param encoding - Optional target encoding; only "utf8" and "base64" are
 * supported, with "utf8" being default
 * @returns The converted string
 */
export function Uint8ArrayToString(arr: Uint8Array, encoding?: string): string {
    // Make this check because Buffer.from(arr) will always do a buffer copy
    if (Buffer.isBuffer(arr)) {
        return arr.toString(encoding);
    } else {
        return Buffer.from(arr).toString(encoding);
    }
}
