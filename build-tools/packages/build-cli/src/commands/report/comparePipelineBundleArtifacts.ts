/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";

import { getArtifactForCommit } from "../../library/azureDevops/getArtifactForCommit.js";
import { getAzureDevopsApi } from "../../library/azureDevops/getAzureDevopsApi.js";
import {
	bundleSizeArtifactsPipeline,
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
		`Download the bundle-size artifacts published by the \`Build - client bundle size artifacts\` ADO pipeline for two commits and emit their per-package, per-bundle differences as JSON. Intended for the PR-comment CI workflow; for local inner-dev-loop comparisons use \`check bundleSize\` instead.`;

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
			artifactName: bundleSizeArtifactsPipeline.bundleAnalyzerJsonArtifactName,
			commit: base,
			definitionId: bundleSizeArtifactsPipeline.definitionId,
			project: bundleSizeArtifactsPipeline.project,
		});
		const baseJsons = extractAnalyzerJsonsFromArtifact(baseArtifact);
		if (baseJsons.size === 0) {
			this.error(`Base artifact contains no analyzer.json files for commit ${base}.`);
		}

		const headArtifact = await getArtifactForCommit({
			adoApi,
			artifactName: bundleSizeArtifactsPipeline.bundleAnalyzerJsonArtifactName,
			commit: head,
			definitionId: bundleSizeArtifactsPipeline.definitionId,
			project: bundleSizeArtifactsPipeline.project,
		});
		const headJsons = extractAnalyzerJsonsFromArtifact(headArtifact);
		if (headJsons.size === 0) {
			this.error(`Head artifact contains no analyzer.json files for commit ${head}.`);
		}

		const comparison = compareJsonReportsByPackage(baseJsons, headJsons);

		this.log(`Compared base=${base} head=${head}.`);

		return { baseCommit: base, headCommit: head, comparison };
	}
}
