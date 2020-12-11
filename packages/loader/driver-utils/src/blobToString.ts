/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IsoBuffer } from "@fluidframework/common-utils";

/**
 * Convert binary blob to string format
 *
 * @param blob - the binary blob
 * @returns the blob in string format
 */
export function blobToString(blob: ArrayBufferLike): string {
    const content = IsoBuffer.from(blob, "utf8").toString("utf8");
    return content;
}

/**
 * Convert binary blob to base64 format
 *
 * @param blob - the binary blob
 * @returns the blob in base64 format
 */
export function blobToBase64(blob: ArrayBufferLike): string {
    const content = IsoBuffer.from(blob).toString("base64");
    return content;
}
