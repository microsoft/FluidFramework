/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";
import { githubTokenFlag } from "../../flags.js";
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
	bundleSizeArtifactsGitHubRepo,
	bundleSizeArtifactsPrPipeline,
	compareJsonReportsByPackage,
	extractAnalyzerJsonsFromArtifact,
	type PackageComparison,
} from "../../library/bundleSize/index.js";
import { BaseCommand } from "../../library/commands/base.js";
import { getCommitParents } from "../../library/githubRest.js";

/**
 * Which side of a comparison we're operating on.
 */
type ComparisonSide = "base" | "head";

/**
 * Failure variants a {@link ComparePipelineBundleArtifactsResult} can surface.
 * Reuses the library's {@link ArtifactLookupFailure} kinds and adds
 * command-level cases for artifacts that downloaded but contain no
 * `analyzer.json` files, and for a base commit that couldn't be derived from
 * the PR build's test-merge commit.
 */
type ComparePipelineSideFailure =
	| ArtifactLookupFailure
	| { kind: "no-analyzer-jsons" }
	| { kind: "no-base-commit" };

/**
 * Result serialized to stdout by `--json`. Discriminated by `kind`:
 *
 * - `completed`: happy path with the structured per-package comparison.
 * - any other kind: failure, scoped to one `side` of the comparison so the consuming workflow can render an actionable sticky comment.
 *
 * `baseCommit` is present on failures too whenever it was resolved before the failure occurred, so
 * the consuming workflow can report which baseline it tried to compare against.
 */
type ComparePipelineBundleArtifactsResult =
	| {
			kind: "completed";
			baseCommit: string;
			headCommit: string;
			comparison: PackageComparison;
	  }
	| (ComparePipelineSideFailure & {
			side: ComparisonSide;
			baseCommit?: string;
	  });

export default class ComparePipelineBundleArtifacts extends BaseCommand<
	typeof ComparePipelineBundleArtifacts
> {
	static readonly description =
		`Download ADO bundle-size artifacts for a PR's CI build and its baseline and emit their per-package, per-bundle differences as JSON. Head-side artifacts come from the \`Build - client packages\` pipeline (runs on PR commits); base-side artifacts come from the \`Build - Client bundle size artifacts\` pipeline (runs on main/release pushes). The base commit is the target-branch commit the PR build actually built against — a PR build builds \`refs/pull/<n>/merge\`, i.e. the PR HEAD merged into the target branch tip at queue time, so that tip (not the merge-base) is the only baseline that isolates the PR's own delta. Intended for the PR-comment CI workflow; for local inner-dev-loop comparisons use \`check bundleSize\` instead.`;

	static readonly enableJsonFlag = true;

	static readonly flags = {
		githubToken: githubTokenFlag({
			description: "GitHub access token used to resolve the PR build's test-merge commit.",
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
		const { head, githubToken } = this.flags;

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
			| { kind: "completed"; jsons: AnalyzerJsonByPackage; sourceVersion: string | undefined }
			| ComparePipelineSideFailure
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
			return { kind: "completed", jsons, sourceVersion: artifact.sourceVersion };
		};

		// Emit a per-side failure: outside `--json` mode print + non-zero exit
		// via `this.error()`; inside `--json` return the structured kind so
		// oclif emits it as the result payload (instead of going through the
		// oclif/core#1608 error path).
		const handleFailure = (
			match: BuildMatch,
			side: ComparisonSide,
			failure: ComparePipelineSideFailure,
			baseCommit?: string,
		): ComparePipelineBundleArtifactsResult => {
			if (!this.jsonEnabled()) {
				const subject =
					match.kind === "commit" ? `commit ${match.sha}` : `PR HEAD ${match.sha}`;
				let message: string;
				switch (failure.kind) {
					case "no-analyzer-jsons": {
						message = `${side === "base" ? "Base" : "Head"} artifact contains no analyzer.json files for ${subject}.`;
						break;
					}
					case "no-base-commit": {
						message = `Could not determine the base commit for ${subject}: the PR build's source version is missing, no longer reachable on GitHub, or not a merge commit. This usually means the build is old enough that its merge commit was garbage-collected; re-run the PR build to get a fresh comparison.`;
						break;
					}
					default: {
						message = describeArtifactFailure(match, failure);
					}
				}
				this.error(message);
			}
			return {
				...failure,
				side,
				...(baseCommit === undefined ? {} : { baseCommit }),
			};
		};

		// Head side first: the PR build identifies the commit the comparison must be based on.
		const headMatch: BuildMatch = { kind: "prHead", sha: head };
		const headResult = await fetchSide(headMatch, bundleSizeArtifactsPrPipeline);
		if (headResult.kind !== "completed") {
			return handleFailure(headMatch, "head", headResult);
		}

		// A PR build builds `refs/pull/<n>/merge` — the PR HEAD merged into the target branch tip
		// as of queue time — so its artifact reflects the PR's changes *plus* everything on the
		// target branch up to that tip. The tip is the merge commit's first parent, and is the only
		// baseline that isolates the PR's own delta. The merge-base would leave every target-branch
		// change since the branch last synced showing up as if the PR caused it.
		const base = await resolveMergedTargetCommit(headResult.sourceVersion, githubToken);
		if (base === undefined) {
			return handleFailure(headMatch, "base", { kind: "no-base-commit" });
		}

		const baseMatch: BuildMatch = { kind: "commit", sha: base };
		const baseResult = await fetchSide(baseMatch, bundleSizeArtifactsBaselinePipeline);
		if (baseResult.kind !== "completed") {
			return handleFailure(baseMatch, "base", baseResult, base);
		}

		const comparison = compareJsonReportsByPackage(baseResult.jsons, headResult.jsons);

		return { kind: "completed", baseCommit: base, headCommit: head, comparison };
	}
}

/**
 * Resolve the target-branch commit a PR build built against — the first parent of the build's
 * test-merge commit (`refs/pull/<n>/merge`), which GitHub creates by merging the PR HEAD into
 * the target branch tip.
 *
 * @returns The target-branch commit SHA, or `undefined` when `sourceVersion` is missing, is no
 * longer reachable on GitHub (unreferenced merge commits are eventually garbage-collected), or
 * isn't a merge commit.
 */
async function resolveMergedTargetCommit(
	sourceVersion: string | undefined,
	token: string,
): Promise<string | undefined> {
	if (sourceVersion === undefined) {
		return undefined;
	}

	const parents = await getCommitParents(
		{ ...bundleSizeArtifactsGitHubRepo, token },
		sourceVersion,
	);
	// A test-merge commit always has two parents: [target branch tip, PR HEAD].
	if (parents === undefined || parents.length < 2) {
		return undefined;
	}
	return parents[0];
}
