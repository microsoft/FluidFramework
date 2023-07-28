/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { BundleMetric, WebpackStatsProcessor } from "../BundleBuddyTypes";

export interface EntryStatsProcessorOptions {
	// Custom callback to customize what text will be used as the metric name
	metricNameProvider?: (chunkName: string) => string;
}

/**
 * Returns a stats processor that returns total asset size information for each entryPoint in the stats object
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
				// QUESTION: Should we be summing up the assets for an entryPoint?
				parsedSize: chunkGroupStats.assets?.reduce((prev, current) => prev + (current?.size ?? 0), 0) ?? 0,
			});
		});

		return result;
	};
}
