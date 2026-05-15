/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BundleAnalyzerPlugin } from "webpack-bundle-analyzer";

import type {
	AnalyzerJsonByPackage,
	BundleData,
	BundlesComparison,
	PackageComparison,
} from "./types.js";

/**
 * Filter `report` to its asset entries and key their size data by asset name.
 * `undefined` is treated as an empty report, so callers can pass an absent
 * side directly.
 */
function jsonReportToBundleSizes(
	report: BundleAnalyzerPlugin.JsonReport | undefined,
): Map<string, BundleData> {
	const sizes = new Map<string, BundleData>();
	if (report === undefined) return sizes;
	for (const entry of report) {
		if (!entry.isAsset) continue;
		sizes.set(entry.label, {
			statSize: entry.statSize,
			parsedSize: entry.parsedSize,
			gzipSize: entry.gzipSize,
		});
	}
	return sizes;
}

/**
 * Compare the asset entries from two `JsonReport`s (one webpack-bundle-analyzer
 * output each side) and produce the per-bundle comparison map. Either side may
 * be `undefined` to represent a package that only exists on the other side.
 * Bundles present only in one side encode added/removed via field presence
 * (see {@link BundlesComparison}).
 */
function compareJsonReports(
	base: BundleAnalyzerPlugin.JsonReport | undefined,
	compare: BundleAnalyzerPlugin.JsonReport | undefined,
): BundlesComparison {
	const baseSizes = jsonReportToBundleSizes(base);
	const compareSizes = jsonReportToBundleSizes(compare);

	const allBundleNames = new Set<string>([...baseSizes.keys(), ...compareSizes.keys()]);

	const bundles: BundlesComparison = {};
	for (const bundleName of allBundleNames) {
		const baseBundle = baseSizes.get(bundleName);
		const compareBundle = compareSizes.get(bundleName);
		bundles[bundleName] = {
			...(baseBundle && { base: baseBundle }),
			...(compareBundle && { compare: compareBundle }),
		};
	}

	return bundles;
}

/**
 * Compare per-package `JsonReport`s for two snapshots and produce a
 * {@link PackageComparison}. Iterates the union of source packages so packages
 * present only on one side are represented (their `compareJsonReports` call
 * treats the absent side as empty).
 */
export function compareJsonReportsByPackage(
	base: AnalyzerJsonByPackage,
	compare: AnalyzerJsonByPackage,
): PackageComparison {
	const allPackages = new Set<string>([...base.keys(), ...compare.keys()]);
	const result: PackageComparison = {};
	for (const sourcePackage of allPackages) {
		result[sourcePackage] = compareJsonReports(
			base.get(sourcePackage),
			compare.get(sourcePackage),
		);
	}
	return result;
}
