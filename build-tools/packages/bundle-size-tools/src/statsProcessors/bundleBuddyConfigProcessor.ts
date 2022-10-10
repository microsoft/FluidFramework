/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { BundleMetric, ChunkToAnalyze, WebpackStatsProcessor } from "../BundleBuddyTypes";
import { getChunkAndDependencySizes } from "../utilities";

export interface BundleBuddyConfigProcessorOptions {
    // Custom callback to customize what text will be used as the metric name
    metricNameProvider?: (chunk: ChunkToAnalyze) => string;
}

/**
 * A stats processor that takes in a bundle specific configuration object for use in bundle analysis
 */
export function getBundleBuddyConfigProcessor(
    options: BundleBuddyConfigProcessorOptions,
): WebpackStatsProcessor {
    return (stats, bundleBuddyConfig) => {
        // This processor requires a config file to run, so return no metrics if no config file is given
        if (!bundleBuddyConfig) {
            return undefined;
        }

        const result = new Map<string, BundleMetric>();

        bundleBuddyConfig.chunksToAnalyze.forEach((chunk) => {
            const chunkAnalysis = getChunkAndDependencySizes(stats, chunk.name);

            // Right now we log the size of the chunk plus all its dependencies. We could support logging just the chunk via a configuration
            const parsedSize = chunkAnalysis.dependencies.reduce(
                (prev, current) => prev + current.size,
                chunkAnalysis.size,
            );

            const metricName = options.metricNameProvider
                ? options.metricNameProvider(chunk)
                : chunk.name;
            result.set(metricName, {
                parsedSize,
            });
        });

        return result;
    };
}
