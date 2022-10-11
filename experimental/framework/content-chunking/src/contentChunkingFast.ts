/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { computeChunksFast } from "./contentChunkingProviders";
import { IChunkingRange, IContentChunker } from "./contentChunkingInterfaces";

/**
 * Implementation class for the FastCDC chunker
 * @see computeChunksFast function for more details
 */
export class FastContentDefinedChunker implements IContentChunker {
    minSize: number;
    avgSize: number;
    maxSize: number;
    constructor(
        avgSize: number,
        sizeRange: (avg: number) => IChunkingRange = function(avg: number) {
            return {
                min: Math.floor(avg / 4),
                max: avg * 4,
            };
        }) {
        const { min, max } = sizeRange(avgSize);
        this.minSize = min;
        this.avgSize = avgSize;
        this.maxSize = max;
    }
    public computeChunks(buffer: Uint8Array): Uint8Array[] {
        const blocks: Uint8Array[] = [];
        if (buffer.byteLength >= 256) {
            const offsets: Uint32Array = computeChunksFast(buffer, this.minSize, this.avgSize, this.maxSize);
            let lastOffset: number = 0;
            for (const offset of offsets.subarray(1).values()) {
                const bytes = buffer.slice(lastOffset, offset);
                blocks.push(bytes);
                lastOffset = offset;
            }
        } else {
            blocks.push(buffer.slice(0, buffer.byteLength));
        }
        return blocks;
    }
}
