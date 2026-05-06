/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
