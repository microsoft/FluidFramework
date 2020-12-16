/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IsoBuffer } from "@fluidframework/common-utils";

/**
 * Convert base64 or utf8 string to array buffer
 */
export function toBuffer(input: string, encoding: string): ArrayBufferLike {
    const iso = IsoBuffer.from(input, encoding);
    return iso.buffer.slice(iso.byteOffset, iso.byteOffset + iso.byteLength);
}
