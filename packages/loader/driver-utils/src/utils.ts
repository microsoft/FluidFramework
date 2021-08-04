/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export const uint8ArrayToArrayBuffer = (array: Uint8Array): ArrayBuffer =>
    array.buffer.slice(array.byteOffset, array.byteOffset + array.byteLength);
