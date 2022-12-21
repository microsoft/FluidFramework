/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as Webpack from "webpack";

import { BundleBuddyConfig, BundleMetricSet, WebpackStatsProcessor } from "../BundleBuddyTypes";

/**
 * Runs a set of stats file processors in order on a given webpack stats file to produce metrics.
 * @param bundleName - A friendly name of the bundle being processed, used for error handling
 * @param stats - The webpack stats file being processed
 * @param config - An optional bundle specific configuration for specifying custom metrics
 * @param statsProcessors  - The set of processors to run on this bundle
 */
export function runProcessorsOnStatsFile(
    bundleName: string,
    stats: Webpack.StatsCompilation,
    config: BundleBuddyConfig | undefined,
    statsProcessors: WebpackStatsProcessor[],
): BundleMetricSet {
    const result: BundleMetricSet = new Map();

    statsProcessors.forEach((processor) => {
        const localMetrics = processor(stats, config);

        if (localMetrics) {
            localMetrics.forEach((value, key) => {
                if (result.has(key)) {
                    throw new Error(
                        `Multiple stats processors tried to write a metric with the same name: ${key} for bundle: ${bundleName}`,
                    );
                }

                result.set(key, value);
            });
        }
    });

    return result;
}
