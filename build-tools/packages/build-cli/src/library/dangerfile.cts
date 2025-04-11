/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ADOSizeComparator,
	BundleComparison,
	BundleComparisonResult,
	BundleMetric,
	bundlesContainNoChanges,
	getAzureDevopsApi,
	totalSizeMetricName,
} from "@fluidframework/bundle-size-tools";

// Handle weirdness with Danger import.  The current module setup prevents us
// from using this file directly, and the js transpilation renames the danger
// import which prevents danger from removing it before evaluation (because it
// actually puts its exports in the global namespace at that time)
declare function markdown(message: string, file?: string, line?: number): void;

declare function warn(message: string, file?: string, line?: number): void;

declare const danger: {
	github: {
		utils: {
			createOrAddLabel: (
				labelConfig: { color: string; description: string; name: string },
				repoConfig?: { owner: string; repo: string; id: number },
			) => Promise<void>;
		};
	};
};
const adoConstants = {
	orgUrl: "https://dev.azure.com/fluidframework",
	projectName: "public",
	ciBuildDefinitionId: 11, // 11 = Build - client packages ; this definition only exists in the public ADO project
	bundleAnalysisArtifactName: "bundleAnalysis",
};

const localReportPath = "./artifacts/bundleAnalysis";

const sizeWarningThresholdBytes = 5120;

export async function dangerfile(): Promise<void> {
	if (process.env.ADO_API_TOKEN === undefined) {
		throw new Error("no env ado api token provided");
	}

	if (process.env.DANGER_GITHUB_API_TOKEN === undefined) {
		throw new Error("no env github api token provided");
	}

	const adoConnection = getAzureDevopsApi(process.env.ADO_API_TOKEN, adoConstants.orgUrl);
	const sizeComparator = new ADOSizeComparator(
		adoConstants,
		adoConnection,
		localReportPath,
		undefined,
		ADOSizeComparator.naiveFallbackCommitGenerator,
	);
	const result: BundleComparisonResult =
		await sizeComparator.createSizeComparisonMessage(false);

	// Post a message only if there was an error (result.comparison is undefined) or if
	// there were actual changes to the bundle sizes.  In other cases, we don't post a
	// message and danger will delete its previous message
	if (result.comparison === undefined || !bundlesContainNoChanges(result.comparison)) {
		// Check for bundle size regression
		const sizeRegressionDetected =
			result.comparison?.some((bundle: BundleComparison) => {
				return Object.entries(bundle.commonBundleMetrics).some(
					([metricName, { baseline, compare }]: [
						string,
						{ baseline: BundleMetric; compare: BundleMetric },
					]) => {
						if (metricName === totalSizeMetricName) {
							return false;
						}
						return compare.parsedSize - baseline.parsedSize > sizeWarningThresholdBytes;
					},
				);
			}) ?? false;

		// Add warning message in case of bundle size regression
		if (sizeRegressionDetected) {
			warn("Bundle size regression detected -- please investigate before merging!");

			try {
				await danger.github.utils.createOrAddLabel({
					color: "ff0000",
					description: "Significant bundle size regression (>5 KB)",
					name: "size regression",
				});
			} catch (error) {
				console.error(`Error adding label: ${error}`);
			}
		}

		markdown(result.message);
	} else {
		console.log("No size changes detected, skipping posting PR comment");
	}
}

// eslint-disable-next-line unicorn/prefer-top-level-await
dangerfile().catch((error: string) => console.error(error));
