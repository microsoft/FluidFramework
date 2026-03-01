/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BundleMetric, WebpackStatsProcessor } from "../BundleBuddyTypes";

export interface EntryStatsProcessorOptions {
	// Custom callback to customize what text will be used as the metric name
	metricNameProvider?: (chunkName: string) => string;
}

/**
 * Returns a stats processor that returns total asset size information for each entryPoint in the stats object
 */
export function getEntryStatsProcessor(
	options: EntryStatsProcessorOptions,
): WebpackStatsProcessor {
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

			// Note: we have the getChunkParsedSize function, but the entrypoints objects we're analyzing here already
			// have a list of the relevant assets and their sizes; no need to take the entrypoints' chunks and pass them to
			// that function.
			let totalSize: number = 0;
			for (const asset of chunkGroupStats.assets ?? []) {
				totalSize += asset?.size ?? 0;
			}

			result.set(metricName, {
				parsedSize: totalSize,
			});
		});

		return result;
	};
}
