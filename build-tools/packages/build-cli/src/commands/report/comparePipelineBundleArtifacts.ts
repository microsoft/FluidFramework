/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";

import { fluidframeworkAdoOrgUrl } from "../../library/azureDevops/constants.js";
import {
	describeArtifactFailure,
	getArtifactForCommit,
} from "../../library/azureDevops/getArtifactForCommit.js";
import { getAzureDevopsApi } from "../../library/azureDevops/getAzureDevopsApi.js";
import {
	bundleSizeArtifactsBaselinePipeline,
	bundleSizeArtifactsPrPipeline,
	compareJsonReportsByPackage,
	extractAnalyzerJsonsFromArtifact,
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
			description:
				"Head commit SHA — the PR's latest commit. The compare side of the comparison.",
			required: true,
		}),
		...BaseCommand.flags,
	} as const;

	public async run(): Promise<ComparePipelineBundleArtifactsResult> {
		const { base, head } = this.flags;

		// Public ADO project — anonymous reads are fine at this command's scale.
		const adoApi = getAzureDevopsApi(undefined, fluidframeworkAdoOrgUrl);

		const baseMatch = { kind: "commit", sha: base } as const;
		const baseArtifact = await getArtifactForCommit({
			adoApi,
			artifactName: bundleSizeArtifactsBaselinePipeline.bundleAnalyzerJsonArtifactName,
			match: baseMatch,
			definitionId: bundleSizeArtifactsBaselinePipeline.definitionId,
			project: bundleSizeArtifactsBaselinePipeline.project,
		});
		if (baseArtifact.kind !== "completed") {
			this.error(describeArtifactFailure(baseMatch, baseArtifact));
		}
		const baseJsons = extractAnalyzerJsonsFromArtifact(baseArtifact.contents);
		if (baseJsons.size === 0) {
			this.error(`Base artifact contains no analyzer.json files for commit ${base}.`);
		}

		const headMatch = { kind: "prHead", sha: head } as const;
		const headArtifact = await getArtifactForCommit({
			adoApi,
			artifactName: bundleSizeArtifactsPrPipeline.bundleAnalyzerJsonArtifactName,
			match: headMatch,
			definitionId: bundleSizeArtifactsPrPipeline.definitionId,
			project: bundleSizeArtifactsPrPipeline.project,
		});
		if (headArtifact.kind !== "completed") {
			this.error(describeArtifactFailure(headMatch, headArtifact));
		}
		const headJsons = extractAnalyzerJsonsFromArtifact(headArtifact.contents);
		if (headJsons.size === 0) {
			this.error(`Head artifact contains no analyzer.json files for commit ${head}.`);
		}

		const comparison = compareJsonReportsByPackage(baseJsons, headJsons);

		return { baseCommit: base, headCommit: head, comparison };
	}
}
