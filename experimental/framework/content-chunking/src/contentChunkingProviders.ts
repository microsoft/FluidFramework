/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { compute_chunks } from "@dstanesc/wasm-chunking-fastcdc-webpack";

/**
 * Chunk an array of bytes using the [FastCDC](https://tinyurl.com/fastcdc) algorithm
 * @param {Uint8Array} source - array of bytes
 * @param {number} minSize - specifies the preferred minimum chunk size. The smallest acceptable value is 64 bytes.
 * @param {number} avgSize - the desired normal size of the chunks. The smallest acceptable value is 256 bytes.
 * @param {number} maxSize - the preferred maximum chunk size. The smallest acceptable value is 1024 bytes.
 * @returns {Uint32Array} an array of offsets.
 * The array boundaries are included. First offset is `0`, last offset is source.byteLength
 * @throws {RangeError} if values lower than the limits specified above are provided
 */
export function computeChunksFast(
    source: Uint8Array,
    minSize: number,
    avgSize: number,
    maxSize: number,
): Uint32Array {
    return compute_chunks(source, minSize, avgSize, maxSize);
}
