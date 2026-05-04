/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BundleAnalyzerPlugin } from "webpack-bundle-analyzer";

import type { BundleMetricSet, BundleSummaries } from "../BundleBuddyTypes";
import type { BundleFileData } from "./getBundleFilePathsFromFolder";

export interface GetBundleSummariesFromAnalyzerArgs {
	bundlePaths: BundleFileData[];

	getAnalyzerJson: (relativePath: string) => Promise<BundleAnalyzerPlugin.JsonReport>;
}

/**
 * Builds a {@link BundleSummaries} from analyzer.json (webpack-bundle-analyzer's
 * `analyzerMode: "json"` output). The data is already pre-summarized per asset, so
 * no stats processors are needed — each asset entry's `parsedSize` becomes a
 * `BundleMetric` keyed by the asset's `label`.
 */
export async function getBundleSummariesFromAnalyzer(
	args: GetBundleSummariesFromAnalyzerArgs,
): Promise<BundleSummaries> {
	const result: BundleSummaries = new Map();

	const pendingAsyncWork = args.bundlePaths.map(async (bundle) => {
		const entries = await args.getAnalyzerJson(bundle.relativePathToStatsFile);

		const metrics: BundleMetricSet = new Map();
		for (const entry of entries) {
			if (entry.isAsset) {
				metrics.set(entry.label, { parsedSize: entry.parsedSize });
			}
		}

		result.set(bundle.bundleName, metrics);
	});

	await Promise.all(pendingAsyncWork);

	return result;
}
