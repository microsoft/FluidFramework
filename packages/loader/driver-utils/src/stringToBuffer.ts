/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IsoBuffer } from "@fluidframework/common-utils";

/**
 * Convert base64 or utf8 string to array buffer
 * @deprecated - here for compatibility, there are same functions in common-utils but
 * those can only be called after release
 */
export function stringToBuffer(input: string, encoding: string): ArrayBufferLike {
    const iso = IsoBuffer.from(input, encoding);
    // In a Node environment, IsoBuffer may be a Node.js Buffer.  Node.js will
    // pool multiple small Buffer instances into a single ArrayBuffer, in which
    // case we need to slice the appropriate span of bytes.
    return iso.byteLength === iso.buffer.byteLength
        ? iso.buffer
        : iso.buffer.slice(iso.byteOffset, iso.byteOffset + iso.byteLength);
}

/**
 * Convert binary blob to string format
 *
 * @deprecated - here for compatibility, there are same functions in common-utils
 */
export const bufferToString = (blob: ArrayBufferLike): string => IsoBuffer.from(blob).toString("utf8");

/**
 * Convert binary blob to base64 format
 *
 * @deprecated - here for compatibility, there are same functions in common-utils
 */
export const bufferToBase64 = (blob: ArrayBufferLike): string => IsoBuffer.from(blob).toString("base64");
