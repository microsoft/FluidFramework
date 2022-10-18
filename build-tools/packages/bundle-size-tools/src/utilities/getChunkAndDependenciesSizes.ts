/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { fail } from "assert";
import { StatsCompilation } from "webpack";

import { getChunkParsedSize } from "./getChunkParsedSize";

export interface ChunkSizeInfo {
    // The id of the chunk
    chunkId: number | string;

    // The size of the chunk
    size: number;
}

/**
 * Gets the complete picture of everything that is required for a given chunk to execute
 */
export interface AggregatedChunkAnalysis {
    // The friendly name of the chunk
    name: string;

    // The complete set of chunks that are required for this chunk to execute
    dependencies: ChunkSizeInfo[];

    // The size of this chunk alone
    size: number;
}

/**
 * This utility is useful for analyzing the performance impact of a given named chunk. It returns the size of the chunk, as well
 * as an array of dependencies that must be downloaded prior to executing this chunk.
 * @param stats - The webpack stats file
 * @param chunkName - The name of the chunk we wish to analyze.
 */
export function getChunkAndDependencySizes(
    stats: StatsCompilation,
    chunkName: string,
): AggregatedChunkAnalysis {
    if (stats.chunks === undefined) {
        throw new Error("No chunks in the stats file given for bundle analysis");
    }

    // Find a chunk that has the desired name
    const rootChunk = stats.chunks.find(
        (c) => (c.names?.length ?? 0) > 0 && c.names!.find((name) => name === chunkName),
    );

    if (rootChunk === undefined) {
        throw new Error(`Could not find chunk with name: ${chunkName} in the stats file`);
    }

    const dependencySizeInfo: ChunkSizeInfo[] = [];

    // To avoid duplicate work, keep track of all the dependencies we have already examined
    const processedDependencies = new Set<number | string>();

    // Get the initial set of dependencies
    const dependenciesToProcess = [...(rootChunk.parents ?? []), ...(rootChunk.siblings ?? [])];

    while (dependenciesToProcess.length > 0) {
        const chunkToProcess = dependenciesToProcess.pop()!;

        if (!processedDependencies.has(chunkToProcess)) {
            dependencySizeInfo.push({
                chunkId: chunkToProcess,
                size: getChunkParsedSize(stats, chunkToProcess),
            });
            processedDependencies.add(chunkToProcess);
        }
    }

    return {
        name: chunkName,
        dependencies: dependencySizeInfo,
        size: getChunkParsedSize(stats, rootChunk.id ?? fail("root chunk does not have id")),
    };
}
