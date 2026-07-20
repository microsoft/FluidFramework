/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BundleAnalyzerPlugin } from "webpack-bundle-analyzer";

/**
 * Map from source package name to that package's parsed analyzer.json
 * (webpack-bundle-analyzer's `analyzerMode: "json"` output).
 */
export type AnalyzerJsonByPackage = Map<string, BundleAnalyzerPlugin.JsonReport>;

/**
 * Data for a single bundle (webpack entrypoint), sourced from
 * webpack-bundle-analyzer's chart data.
 */
export interface BundleData {
	/**
	 * Sum of source-module sizes before tree-shaking and minification.
	 */
	statSize: number;
	/**
	 * Post-minification on-disk size — what's actually emitted to the bundle output.
	 */
	parsedSize: number;
	/**
	 * Estimated size after gzip compression — closest proxy for what users download.
	 */
	gzipSize: number;
}

/**
 * Per-bundle comparison for one source package, keyed by bundle name (webpack
 * entrypoint). Field presence on each entry encodes three states:
 * - **pre-existing** (existed in both): both `base` and `compare` present
 * - **added** (only in PR): only `compare` present
 * - **removed** (only in baseline): only `base` present
 */
export type BundlesComparison = {
	[bundleName: string]: {
		base?: BundleData;
		compare?: BundleData;
	};
};

/**
 * Full comparison keyed by source package name. Packages present only on one
 * side appear with that side's bundles only.
 *
 * The producer is deliberately unopinionated: it emits raw sizes only. Consumers
 * compute deltas, percentages, and apply their own thresholds / regression rules.
 */
export type PackageComparison = {
	[sourcePackage: string]: BundlesComparison;
};
