/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";

import { getArtifactForCommit } from "../../library/azureDevops/getArtifactForCommit.js";
import { getAzureDevopsApi } from "../../library/azureDevops/getAzureDevopsApi.js";
import {
	bundleSizeArtifactsBaselinePipeline,
	bundleSizeArtifactsPrPipeline,
	compareJsonReportsByPackage,
	extractAnalyzerJsonsFromArtifact,
	fluidframeworkAdoOrgUrl,
	type PackageComparison,
} from "../../library/bundleSize/index.js";
import { BaseCommand } from "../../library/commands/base.js";

/**
 * Result serialized to stdout by `--json`.
 */
interface ComparePipelineBundleArtifactsResult {
	baseCommit: string;
	headCommit: string;
	comparison: PackageComparison;
}

export default class ComparePipelineBundleArtifacts extends BaseCommand<
	typeof ComparePipelineBundleArtifacts
> {
	static readonly description =
		`Download ADO bundle-size artifacts for two commits and emit their per-package, per-bundle differences as JSON. Base-side artifacts come from the \`Build - Client bundle size artifacts\` pipeline (runs on main/release pushes); head-side artifacts come from the \`Build - client packages\` pipeline (runs on PR commits). Intended for the PR-comment CI workflow; for local inner-dev-loop comparisons use \`check bundleSize\` instead.`;

	static readonly enableJsonFlag = true;

	static readonly flags = {
		base: Flags.string({
			description:
				"Base commit SHA — the merge-base on the target branch. The baseline of the comparison.",
			required: true,
		}),
		head: Flags.string({
			description: "Head commit SHA — the PR's tip. The compare side of the comparison.",
			required: true,
		}),
		...BaseCommand.flags,
	} as const;

	public async run(): Promise<ComparePipelineBundleArtifactsResult> {
		const { base, head } = this.flags;

		// Public ADO project — anonymous reads are fine at this command's scale.
		const adoApi = getAzureDevopsApi(undefined, fluidframeworkAdoOrgUrl);

		const baseArtifact = await getArtifactForCommit({
			adoApi,
			artifactName: bundleSizeArtifactsBaselinePipeline.bundleAnalyzerJsonArtifactName,
			commit: base,
			definitionId: bundleSizeArtifactsBaselinePipeline.definitionId,
			project: bundleSizeArtifactsBaselinePipeline.project,
		});
		const baseJsons = extractAnalyzerJsonsFromArtifact(baseArtifact);
		if (baseJsons.size === 0) {
			this.error(`Base artifact contains no analyzer.json files for commit ${base}.`);
		}

		const headArtifact = await getArtifactForCommit({
			adoApi,
			artifactName: bundleSizeArtifactsPrPipeline.bundleAnalyzerJsonArtifactName,
			commit: head,
			definitionId: bundleSizeArtifactsPrPipeline.definitionId,
			project: bundleSizeArtifactsPrPipeline.project,
		});
		const headJsons = extractAnalyzerJsonsFromArtifact(headArtifact);
		if (headJsons.size === 0) {
			this.error(`Head artifact contains no analyzer.json files for commit ${head}.`);
		}

		const comparison = compareJsonReportsByPackage(baseJsons, headJsons);

		return { baseCommit: base, headCommit: head, comparison };
	}
}
