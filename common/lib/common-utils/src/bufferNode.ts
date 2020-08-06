/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Declare the subset of Buffer functionality we want to make available instead of
 * exposing the entirely of Node's typings.  This should match the public interface
 * of the browser implementation, so any changes made in one should be made in both.
 */
declare class Buffer extends Uint8Array {
    toString(encoding?: string): string;
    /**
     * @param value string | ArrayBuffer
     * @param encodingOrOffset string | number
     * @param length number
     */
    static from(value, encodingOrOffset?, length?): Buffer;
    static fromArrayBuffer(arrayBuffer: ArrayBuffer, byteOffset?: number, byteLength?: number): Buffer;
    static fromString(str: string, encoding?: string): Buffer;
}
export const IsoBuffer = Buffer;
export type IsoBuffer = Buffer;
