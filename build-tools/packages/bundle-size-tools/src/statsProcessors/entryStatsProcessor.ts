/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { fail } from "assert";

import { BundleMetric, WebpackStatsProcessor } from "../BundleBuddyTypes";
import { getChunkParsedSize } from "../utilities";

export interface EntryStatsProcessorOptions {
    // Custom callback to customize what text will be used as the metric name
    metricNameProvider?: (chunkName: string) => string;
}

/**
 * A simple stats processor that simply returns the size information for the entry chunk
 */
export function getEntryStatsProcessor(options: EntryStatsProcessorOptions): WebpackStatsProcessor {
    return (stats) => {
        const result = new Map<string, BundleMetric>();

        if (!stats.entrypoints) {
            return result;
        }

        Object.entries(stats.entrypoints).forEach((value) => {
            const [chunkName, chunkGroupStats] = value;
            const metricName = options.metricNameProvider
                ? options.metricNameProvider(chunkName)
                : chunkName;
            result.set(metricName, {
                parsedSize: getChunkParsedSize(
                    stats,
                    (chunkGroupStats.chunks ?? fail("missing chunk"))[0],
                ),
            });
        });

        return result;
    };
}
