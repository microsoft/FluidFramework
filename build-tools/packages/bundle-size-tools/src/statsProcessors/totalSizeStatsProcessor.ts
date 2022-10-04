/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { BundleMetric, WebpackStatsProcessor } from "../BundleBuddyTypes";

export interface TotalSizeStatsProcessorOptions {
    // The total stats processor reports a single metric for the total size of the bundle, this is the string that should be used for that metric
    metricName: string;
}

/**
 * A simple stats processor that simply returns the size information for the entry chunk
 */
export function getTotalSizeStatsProcessor(
    options: TotalSizeStatsProcessorOptions,
): WebpackStatsProcessor {
    return (stats) => {
        const result = new Map<string, BundleMetric>();

        if (!stats.assets) {
            return result;
        }

        const totalSize = stats.assets.reduce((prev, current) => {
            // Assets contains many file types, including source maps, we only care abut js files
            if (current.name.endsWith(".js")) {
                return prev + current.size;
            }
            return prev;
        }, 0);

        result.set(options.metricName, { parsedSize: totalSize });

        return result;
    };
}
