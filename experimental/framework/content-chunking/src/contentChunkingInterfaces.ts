/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Enumeration of supported chunking strategies
 */
export enum ChunkingStrategyEnum {
    FixedSize,
    ContentDefined,
}

/**
 * Generic chunking configuration
 */
export interface IChunkingConfig {
    avgChunkSize: number;
    chunkingStrategy: ChunkingStrategyEnum;
    sizeRange?: (avg: number) => IChunkingRange;
}

/**
 * Encapsulates the chunking range for chunking strategies different than {@link ChunkingStrategyEnum.FixedSize }
 */
export interface IChunkingRange {
    min: number;
    max: number;
}

/**
 * Interface describing the ability to chunk
 */
export interface IContentChunker {
    computeChunks: (buffer: Uint8Array) => Uint8Array[];
}
