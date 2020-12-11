/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IsoBuffer } from "@fluidframework/common-utils";

/**
 * Convert base64 or utf8 string to array buffer
 */
export function toBuffer(input: string, encoding: string): ArrayBufferLike {
    console.log(IsoBuffer.from(input,encoding));
    console.log(IsoBuffer.from(input, encoding).buffer);
    return IsoBuffer.from(input, encoding).buffer;
}
