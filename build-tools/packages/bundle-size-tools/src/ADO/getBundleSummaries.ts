/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { StatsCompilation } from "webpack";
import type { BundleAnalyzerPlugin } from "webpack-bundle-analyzer";

import type {
	BundleBuddyConfig,
	BundleMetricSet,
	BundleSummaries,
	WebpackStatsProcessor,
} from "../BundleBuddyTypes";
import { runProcessorsOnStatsFile } from "../utilities/runProcessorOnStatsFile";
import type { BundleFileData } from "./getBundleFilePathsFromFolder";

export interface GetBundleSummariesArgs {
	bundlePaths: BundleFileData[];

	statsProcessors: WebpackStatsProcessor[];

	getStatsFile: (relativePath: string) => Promise<StatsCompilation>;

	getBundleBuddyConfigFile: (
		bundleName: string,
	) => Promise<BundleBuddyConfig | undefined> | (BundleBuddyConfig | undefined);
}

export async function getBundleSummaries(
	args: GetBundleSummariesArgs,
): Promise<BundleSummaries> {
	const result: BundleSummaries = new Map();

	const pendingAsyncWork = args.bundlePaths.map(async (bundle) => {
		const [statsFile, bundleBuddyConfig] = await Promise.all([
			args.getStatsFile(bundle.relativePathToStatsFile),
			args.getBundleBuddyConfigFile(bundle.bundleName),
		]);

		const bundleSummary = runProcessorsOnStatsFile(
			bundle.bundleName,
			statsFile!, // non-null assertion here needed to due TS bug. Stats file is never undefined here
			bundleBuddyConfig,
			args.statsProcessors,
		);

		result.set(bundle.bundleName, bundleSummary);
	});

	await Promise.all(pendingAsyncWork);

	return result;
}

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
