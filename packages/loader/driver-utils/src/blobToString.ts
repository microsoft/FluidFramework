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
export const blobToString = (blob: ArrayBufferLike) => IsoBuffer.from(blob, "utf8").toString("utf8");

/**
 * Convert binary blob to base64 format
 *
 * @param blob - the binary blob
 * @returns the blob in base64 format
 */
export const blobToBase64 = (blob: ArrayBufferLike) => IsoBuffer.from(blob, "base64").toString("base64");
