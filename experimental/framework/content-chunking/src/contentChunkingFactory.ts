/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IChunkingConfig, IChunkingRange, ChunkingStrategyEnum, IContentChunker } from "./contentChunkingInterfaces";
import { FastContentDefinedChunker } from "./contentChunkingFast";
import { FixedSizeContentChunker } from "./contentChunkingFixed";

/**
 * Instantiate a chunking method based on the provided specification
 */
export function createChunkingMethod(chunkingConfig: IChunkingConfig): IContentChunker {
    const avgSize = chunkingConfig.avgChunkSize;
    if (!Number.isInteger(avgSize) || avgSize < 256) {
        throw new Error(`avgChunkSize should be a positive integer larger or equal to 256. Wrong input ${avgSize}`);
    }
    if (chunkingConfig.sizeRange !== undefined) {
        const { min, max }: IChunkingRange = chunkingConfig.sizeRange(avgSize);
        if (!Number.isInteger(min) || min < 32) {
            throw new Error(`min should be a positive integer larger or equal to 32. Wrong input ${min}`);
        }
        if (!Number.isInteger(max) || max < 1024) {
            throw new Error(`max should be a positive integer larger or equal to 1024. Wrong input ${max}`);
        }
    }
    let contentChunker: IContentChunker;
    switch (chunkingConfig.chunkingStrategy) {
        case ChunkingStrategyEnum.FixedSize:
            contentChunker = new FixedSizeContentChunker(avgSize); break;
        case ChunkingStrategyEnum.ContentDefined:
            contentChunker = new FastContentDefinedChunker(avgSize, chunkingConfig.sizeRange); break;
        default: throw new Error(`Unknown chunking strategy ${chunkingConfig.chunkingStrategy}`);
    }
    return contentChunker;
}
