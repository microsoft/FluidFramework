/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";

import { fluidframeworkAdoOrgUrl } from "../../library/azureDevops/constants.js";
import {
	type ArtifactLookupFailure,
	type BuildMatch,
	describeArtifactFailure,
	getArtifactForCommit,
} from "../../library/azureDevops/getArtifactForCommit.js";
import { getAzureDevopsApi } from "../../library/azureDevops/getAzureDevopsApi.js";
import {
	type AnalyzerJsonByPackage,
	bundleSizeArtifactsBaselinePipeline,
	bundleSizeArtifactsPrPipeline,
	compareJsonReportsByPackage,
	extractAnalyzerJsonsFromArtifact,
	type PackageComparison,
} from "../../library/bundleSize/index.js";
import { BaseCommand } from "../../library/commands/base.js";

/**
 * Which side of a comparison we're operating on.
 */
type ComparisonSide = "base" | "head";

/**
 * Failure variants a {@link ComparePipelineBundleArtifactsResult} can surface.
 * Reuses the library's {@link ArtifactLookupFailure} kinds and adds a
 * command-level case for artifacts that downloaded but contain no
 * `analyzer.json` files.
 */
type ComparePipelineSideFailure = ArtifactLookupFailure | { kind: "no-analyzer-jsons" };

/**
 * Result serialized to stdout by `--json`. Discriminated by `kind`:
 *
 * - `completed`: happy path with the structured per-package comparison.
 * - any other kind: failure, scoped to one `side` of the comparison so the consuming workflow can render an actionable sticky comment.
 */
type ComparePipelineBundleArtifactsResult =
	| {
			kind: "completed";
			baseCommit: string;
			headCommit: string;
			comparison: PackageComparison;
	  }
	| (ComparePipelineSideFailure & { side: ComparisonSide });

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

		// Fetch and validate one side. Returns the parsed analyzer.json map on
		// success, or a structured failure kind. The caller decides whether to
		// emit a printed error and exit non-zero.
		const fetchSide = async (
			match: BuildMatch,
			pipeline: {
				project: string;
				definitionId: number;
				bundleAnalyzerJsonArtifactName: string;
			},
		): Promise<
			{ kind: "completed"; jsons: AnalyzerJsonByPackage } | ComparePipelineSideFailure
		> => {
			const artifact = await getArtifactForCommit({
				adoApi,
				artifactName: pipeline.bundleAnalyzerJsonArtifactName,
				match,
				definitionId: pipeline.definitionId,
				project: pipeline.project,
			});
			if (artifact.kind !== "completed") {
				return { kind: artifact.kind };
			}
			const jsons = extractAnalyzerJsonsFromArtifact(artifact.contents);
			if (jsons.size === 0) {
				return { kind: "no-analyzer-jsons" };
			}
			return { kind: "completed", jsons };
		};

		// Emit a per-side failure: outside `--json` mode print + non-zero exit
		// via `this.error()`; inside `--json` return the structured kind so
		// oclif emits it as the result payload (instead of going through the
		// oclif/core#1608 error path).
		const handleFailure = (
			match: BuildMatch,
			side: ComparisonSide,
			failure: ComparePipelineSideFailure,
		): ComparePipelineBundleArtifactsResult => {
			if (!this.jsonEnabled()) {
				const subject =
					match.kind === "commit" ? `commit ${match.sha}` : `PR HEAD ${match.sha}`;
				const message =
					failure.kind === "no-analyzer-jsons"
						? `${side === "base" ? "Base" : "Head"} artifact contains no analyzer.json files for ${subject}.`
						: describeArtifactFailure(match, failure);
				this.error(message);
			}
			return { ...failure, side };
		};

		const baseMatch: BuildMatch = { kind: "commit", sha: base };
		const baseResult = await fetchSide(baseMatch, bundleSizeArtifactsBaselinePipeline);
		if (baseResult.kind !== "completed") {
			return handleFailure(baseMatch, "base", baseResult);
		}

		const headMatch: BuildMatch = { kind: "prHead", sha: head };
		const headResult = await fetchSide(headMatch, bundleSizeArtifactsPrPipeline);
		if (headResult.kind !== "completed") {
			return handleFailure(headMatch, "head", headResult);
		}

		const comparison = compareJsonReportsByPackage(baseResult.jsons, headResult.jsons);

		return { kind: "completed", baseCommit: base, headCommit: head, comparison };
	}
}
