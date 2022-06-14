/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { StatsCompilation } from 'webpack';

/**
 * A map of bundles friendly names to their relevant metrics
 */
export type BundleSummaries = Map<string, BundleMetricSet>;

/**
 * A collection of all the relevant size metrics for a given bundle. A bundle can have one or more named metrics that
 * could map to a single chunk or a collection chunks.
 */
export type BundleMetricSet = Map<string, BundleMetric>;

/**
 * A description of the size of a particular part of a bundle
 */
export interface BundleMetric {
  parsedSize: number;
}

/**
 * A comparison of two bundles
 */
export interface BundleComparison {
  bundleName: string;

  commonBundleMetrics: { [key: string]: { baseline: BundleMetric; compare: BundleMetric } };
}

/**
 * The formatted message string of a bundle comparison along with the
 * comparison data itself
 */
export type BundleComparisonResult = {
  message: string,
  comparison: BundleComparison[] | undefined,
};

/**
 * Functions used to process a webpack stats file and produce a set of metrics. Some processors may choose
 * to work off a bundle specific config file. Note that these config files are optional, so not all bundles
 * may have one associated with them.
 */
export type WebpackStatsProcessor = (
  stats: StatsCompilation,
  config: BundleBuddyConfig | undefined
) => BundleMetricSet | undefined;

/**
 * Defines a specific chunk in a bundle to be analyzed by this tool.
 */
export interface ChunkToAnalyze {
  name: string;
}

/**
 * A configuration file that can be used to run customized analysis for a bundle
 */
export interface BundleBuddyConfig {
  /**
   * A array of chunk to be analyzed by bundle buddy
   */
  chunksToAnalyze: ChunkToAnalyze[];
}
