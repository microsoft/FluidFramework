/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	ADOSizeComparator,
	type BundleComparison,
	type BundleMetric,
	bundlesContainNoChanges,
	getAzureDevopsApi,
	totalSizeMetricName,
} from "@fluidframework/bundle-size-tools";
import { Flags } from "@oclif/core";

import { BaseCommand } from "../../library/commands/base.js";

// ADO constants for the baseline build source.
// Must match the "public" project + build-bundle-size-artifacts.yml (definitionId 48).
const adoConstants = {
	orgUrl: "https://dev.azure.com/fluidframework",
	projectName: "public",
	ciBuildDefinitionId: 48,
	bundleAnalysisArtifactName: "bundleAnalysis",
} as const;

// Default path to the PR's locally-collected bundle reports.
// Matches where `flub generate bundleStats` (invoked via `npm run bundle-analysis:collect`) writes.
const defaultLocalReportPath = "./artifacts/bundleAnalysis";

// Default output directory. The pipeline publishes this directory as the `bundleSizeDiff`
// artifact.
const defaultOutputDir = "./artifacts/bundleSizeDiff";

// Any single non-total metric that grows by more than this threshold is considered a
// regression.
const sizeRegressionThresholdBytes = 5120;

// Output file names. Only one of these is present per run: `result.json` when the
// comparison produced a meaningful result, or `error.json` when it did not. Consumers
// use file existence as the success/failure discriminator without needing to parse JSON.
const resultFileName = "result.json";
const errorFileName = "error.json";

/**
 * Shape of the `result.json` file produced on a successful comparison, discriminated by
 * `kind`. On `"no-changes"`, the comparison ran and found no size deltas. On `"changes"`,
 * the comparison found size deltas; `comparison` holds the diff and `sizeRegressionDetected`
 * flags any non-total metric that grew past the threshold.
 */
type BundleSizeDiffResult = {
	prNumber: number;
	baseCommit: string;
	targetBranch: string;
} & (
	| { kind: "no-changes" }
	| { kind: "changes"; sizeRegressionDetected: boolean; comparison: BundleComparison[] }
);

/**
 * Shape of the `error.json` file produced when the command could not produce a comparison
 * (e.g. no usable baseline build, an unexpected ADO API failure). `baseCommit` may be
 * `undefined` if the baseline search never reached a candidate.
 */
interface BundleSizeDiffError {
	prNumber: number;
	baseCommit: string | undefined;
	targetBranch: string;
	error: string;
}

/**
 * Compute whether any bundle shows a non-total metric growing by more than the regression
 * threshold.
 */
function detectSizeRegression(comparison: BundleComparison[]): boolean {
	return comparison.some((bundle: BundleComparison) =>
		Object.entries(bundle.commonBundleMetrics).some(
			([metricName, { baseline, compare }]: [
				string,
				{ baseline: BundleMetric; compare: BundleMetric },
			]) => {
				if (metricName === totalSizeMetricName) {
					return false;
				}
				return compare.parsedSize - baseline.parsedSize > sizeRegressionThresholdBytes;
			},
		),
	);
}

export default class GenerateBundleSizeDiff extends BaseCommand<
	typeof GenerateBundleSizeDiff
> {
	static readonly description =
		`Compare the PR's locally-collected bundle reports against the CI build of the merge-base commit (the commit on the target branch the PR is based on) and write the outcome as one of two structured files in the output directory: result.json on success, error.json on failure.`;

	static readonly enableJsonFlag = true;

	static readonly flags = {
		localReportPath: Flags.directory({
			description: `Path to the locally-collected bundle reports for the PR (as produced by \`flub generate bundleStats\`).`,
			default: defaultLocalReportPath,
			required: false,
		}),
		outputDir: Flags.directory({
			description: `Directory to write result.json or error.json into.`,
			default: defaultOutputDir,
			required: false,
		}),
		// Hidden flags carrying CI context. Populated from env vars when running in the
		// pipeline; can be passed directly for local testing.
		targetBranch: Flags.string({
			description: "Name of the target branch the PR will merge into.",
			env: "TARGET_BRANCH",
			required: true,
			hidden: true,
		}),
		prNumber: Flags.integer({
			description: "GitHub PR number being analyzed.",
			env: "PR_NUMBER",
			required: true,
			hidden: true,
		}),
		adoApiToken: Flags.string({
			description:
				"ADO PAT for accessing the baseline build. When absent, anonymous reads are used (suitable for fork PR builds where $(System.AccessToken) isn't populated).",
			env: "ADO_API_TOKEN",
			required: false,
			hidden: true,
		}),
		...BaseCommand.flags,
	} as const;

	public async run(): Promise<BundleSizeDiffResult | BundleSizeDiffError> {
		const { adoApiToken, localReportPath, outputDir, prNumber, targetBranch } = this.flags;

		const adoConnection = getAzureDevopsApi(adoApiToken, adoConstants.orgUrl);
		const sizeComparator = new ADOSizeComparator(
			adoConstants,
			adoConnection,
			localReportPath,
			targetBranch,
			undefined,
			ADOSizeComparator.naiveFallbackCommitGenerator,
		);
		const comparisonResult = await sizeComparator.getSizeComparison(false);

		const resolvedOutputDir = path.resolve(process.cwd(), outputDir);
		await mkdir(resolvedOutputDir, { recursive: true });
		const resultPath = path.join(resolvedOutputDir, resultFileName);
		const errorPath = path.join(resolvedOutputDir, errorFileName);

		// Clear any prior output files so consumers can rely on file existence as the
		// success/failure discriminator without worrying about stale artifacts from earlier runs.
		await Promise.all([rm(resultPath, { force: true }), rm(errorPath, { force: true })]);

		if (comparisonResult.kind === "error") {
			const errorResult: BundleSizeDiffError = {
				prNumber,
				baseCommit: comparisonResult.baselineCommit,
				targetBranch,
				error: comparisonResult.error,
			};
			await writeFile(errorPath, JSON.stringify(errorResult, undefined, 2));
			this.info(`Wrote ${errorPath}`);
			return errorResult;
		}

		// An empty comparison means the baseline or PR collection produced no bundles;
		// surface that as an error rather than a misleading "no-changes" result.
		if (comparisonResult.comparison.length === 0) {
			const errorResult: BundleSizeDiffError = {
				prNumber,
				baseCommit: comparisonResult.baselineCommit,
				targetBranch,
				error:
					"No bundles to compare — baseline artifact or PR local bundle reports are empty.",
			};
			await writeFile(errorPath, JSON.stringify(errorResult, undefined, 2));
			this.info(`Wrote ${errorPath}`);
			return errorResult;
		}

		const { baselineCommit, comparison } = comparisonResult;
		const common = {
			prNumber,
			baseCommit: baselineCommit,
			targetBranch,
		};
		const result: BundleSizeDiffResult = bundlesContainNoChanges(comparison)
			? { ...common, kind: "no-changes" }
			: {
					...common,
					kind: "changes",
					sizeRegressionDetected: detectSizeRegression(comparison),
					comparison,
				};

		await writeFile(resultPath, JSON.stringify(result, undefined, 2));
		this.info(`Wrote ${resultPath}`);
		return result;
	}
}
