/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";
import {
	ADOSizeComparator,
	type BundleComparison,
	bundlesContainNoChanges,
	getAzureDevopsApi,
} from "../../library/bundleSizeDiff/index.js";

import { BaseCommand } from "../../library/commands/base.js";

// ADO constants for the baseline build source.
// Must match the "public" project + build-bundle-size-artifacts.yml (definitionId 48).
const adoConstants = {
	orgUrl: "https://dev.azure.com/fluidframework",
	projectName: "public",
	ciBuildDefinitionId: 48,
	artifactName: "bundleAnalyzerJson",
} as const;

// Default path to the PR's locally-collected analyzer.json files.
// Matches where `flub generate bundleStats` (invoked via `npm run bundle-analysis:collect`) writes.
const defaultLocalReportPath = "./artifacts/bundleAnalyzerJson";

/**
 * Discriminated result returned to JSON callers (`--json`). Default invocations
 * print a human-readable summary to stdout; the return value is what `--json`
 * serializes.
 */
type CheckBundleSizeResult =
	| { kind: "no-changes"; baselineCommit: string }
	| { kind: "changes"; baselineCommit: string; comparison: BundleComparison[] }
	| { kind: "error"; baselineCommit: string | undefined; error: string };

export default class CheckBundleSize extends BaseCommand<typeof CheckBundleSize> {
	static readonly description =
		`Compare the locally-collected bundle reports against the CI build of the merge-base commit (the commit on the target branch the local branch is based on) and print the diff. Prints a human-readable summary by default; pass --json for the structured result.`;

	static readonly enableJsonFlag = true;

	static readonly flags = {
		localReportPath: Flags.directory({
			description: `Path to the locally-collected bundle reports (as produced by \`flub generate bundleStats\`).`,
			default: defaultLocalReportPath,
			required: false,
		}),
		targetBranch: Flags.string({
			description: "Name of the target branch to compute the baseline from.",
			default: "main",
			required: false,
		}),
		adoApiToken: Flags.string({
			description:
				"ADO PAT for accessing the baseline build. When absent, anonymous reads are used (suitable for fork PR builds where $(System.AccessToken) isn't populated).",
			env: "ADO_API_TOKEN",
			required: false,
		}),
		...BaseCommand.flags,
	} as const;

	public async run(): Promise<CheckBundleSizeResult> {
		const { adoApiToken, localReportPath, targetBranch } = this.flags;

		const adoApi = getAzureDevopsApi(adoApiToken, adoConstants.orgUrl);
		const sizeComparator = new ADOSizeComparator(
			adoConstants,
			adoApi,
			localReportPath,
			targetBranch,
		);
		const comparisonResult = await sizeComparator.getSizeComparison();

		if (comparisonResult.kind === "error") {
			this.warning(comparisonResult.error);
			return {
				kind: "error",
				baselineCommit: comparisonResult.baselineCommit,
				error: comparisonResult.error,
			};
		}

		if (comparisonResult.comparison.length === 0) {
			const message =
				"No bundles to compare — baseline artifact or local bundle reports are empty.";
			this.warning(message);
			return {
				kind: "error",
				baselineCommit: comparisonResult.baselineCommit,
				error: message,
			};
		}

		const { baselineCommit, comparison } = comparisonResult;

		if (bundlesContainNoChanges(comparison)) {
			this.log(`No bundle size changes vs baseline commit ${baselineCommit}.`);
			return { kind: "no-changes", baselineCommit };
		}

		this.log(`Bundle size changes vs baseline commit ${baselineCommit}:`);
		for (const bundle of comparison) {
			this.log(`  ${bundle.bundleName}:`);
			for (const [metricName, { baseline, compare }] of Object.entries(
				bundle.commonBundleMetrics,
			)) {
				const delta = compare.parsedSize - baseline.parsedSize;
				if (delta === 0) continue;
				const sign = delta > 0 ? "+" : "";
				this.log(
					`    ${metricName}: ${baseline.parsedSize} -> ${compare.parsedSize} (${sign}${delta})`,
				);
			}
		}

		return { kind: "changes", baselineCommit, comparison };
	}
}
