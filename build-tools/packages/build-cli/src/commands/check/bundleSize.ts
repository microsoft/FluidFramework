/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";
import { getAzureDevopsApi } from "../../library/azureDevops/getAzureDevopsApi.js";
import {
	ADOSizeComparator,
	type BundleComparison,
	bundlesContainNoChanges,
	pickFreshestCanonicalRemote,
} from "../../library/bundleSize/index.js";

import { BaseCommand } from "../../library/commands/base.js";

// Must match the "public" project + build-bundle-size-artifacts.yml (definitionId 48).
const adoConstants = {
	orgUrl: "https://dev.azure.com/fluidframework",
	projectName: "public",
	ciBuildDefinitionId: 48,
	artifactName: "bundleAnalyzerJson",
} as const;

// Where `flub generate bundleStats` (via `npm run bundle-analysis:collect`) writes.
const defaultLocalReportPath = "./artifacts/bundleAnalyzerJson";

/**
 * Result serialized to stdout by `--json`. Default invocations print a
 * human-readable summary instead.
 */
type CheckBundleSizeResult =
	| { kind: "no-changes"; baselineCommit: string }
	| { kind: "changes"; baselineCommit: string; comparison: BundleComparison[] }
	| { kind: "error"; baselineCommit: string | undefined; error: string };

export default class CheckBundleSize extends BaseCommand<typeof CheckBundleSize> {
	static readonly description =
		`Compare the locally-collected bundle reports against the CI build of the merge-base commit (between HEAD and a target ref) and print the diff. By default, the target is auto-detected as \`<canonical-remote>/main\` where \`<canonical-remote>\` is whichever remote points at \`microsoft/FluidFramework\`; pass \`--target\` to override. Prints a human-readable summary by default; pass --json for the structured result.`;

	static readonly enableJsonFlag = true;

	static readonly flags = {
		localReportPath: Flags.directory({
			description: `Path to the locally-collected bundle reports (as produced by \`flub generate bundleStats\`).`,
			default: defaultLocalReportPath,
			required: false,
		}),
		target: Flags.string({
			description:
				"Target ref — the ref you'd be PRing against. Typically `<remote>/<branch>` (e.g. 'upstream/main', 'origin/release/2.x'), but accepts any ref `git merge-base` understands. Skips auto-detection of the canonical remote. The bundles aren't compared against this ref directly — the baseline commit is `git merge-base <target> HEAD`.",
			required: false,
		}),
		...BaseCommand.flags,
	} as const;

	public async run(): Promise<CheckBundleSizeResult> {
		const { localReportPath, target } = this.flags;

		// Auto-detect targets `main` on the canonical remote; `--target <ref>` overrides.
		const branch = "main";
		let targetRef: string;
		if (target !== undefined) {
			targetRef = target;
			this.log(`Using explicit target ref ${target}.`);
		} else {
			const remote = pickFreshestCanonicalRemote(branch) ?? "origin";
			targetRef = `${remote}/${branch}`;
			this.log(`Using target ref ${targetRef}. Pass --target <ref> to override.`);
		}

		// Anonymous reads work for the public ADO project at this command's scale;
		// automated consumers authenticate at the library layer.
		const adoApi = getAzureDevopsApi(undefined, adoConstants.orgUrl);
		const sizeComparator = new ADOSizeComparator(
			adoConstants,
			adoApi,
			localReportPath,
			targetRef,
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
