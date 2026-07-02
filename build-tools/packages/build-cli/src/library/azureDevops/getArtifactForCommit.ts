/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { WebApi } from "azure-devops-node-api";
import {
	type Build,
	BuildResult,
	BuildStatus,
} from "azure-devops-node-api/interfaces/BuildInterfaces.js";

import { type ArtifactContents, downloadArtifact } from "./downloadArtifact.js";
import { getBuilds } from "./utils.js";

// Search window — ADO has no query-by-SHA API, so we fetch this many recent
// builds and filter client-side. Caps how stale a target SHA can be. At the
// observed CI rate in this repo (~5 main-branch builds/day per pipeline),
// 500 builds covers roughly the last 3 months.
const recentBuildsToFetch = 500;

/**
 * How to identify the ADO build for a SHA.
 *
 * - `commit`: match `Build.sourceVersion`. For builds queued against a real commit on a branch (main, release/*).
 * - `prHead`: match `Build.triggerInfo['pr.sourceSha']`. For PR builds, where `sourceVersion` is the ephemeral test-merge SHA and the PR HEAD lives on `triggerInfo['pr.sourceSha']`.
 */
export type BuildMatch = { kind: "commit"; sha: string } | { kind: "prHead"; sha: string };

/** Human-readable label for the SHA in `match`. */
function describeMatch(match: BuildMatch): string {
	return match.kind === "commit" ? `commit ${match.sha}` : `PR HEAD ${match.sha}`;
}

/** `true` if `b` is the build `match` identifies — see {@link BuildMatch}. */
function buildMatches(b: Build, match: BuildMatch): boolean {
	if (match.kind === "commit") {
		return b.sourceVersion === match.sha;
	}
	// `triggerInfo` isn't on `Build` but is in the REST response for PR builds.
	return (
		(b as unknown as { triggerInfo?: Record<string, string> }).triggerInfo?.[
			"pr.sourceSha"
		] === match.sha
	);
}

/**
 * Failure variants shared by {@link FindBuildIdResult} and {@link GetArtifactForCommitResult}.
 *
 * - `no-build`: no candidate builds matched the SHA — too stale, or never queued.
 * - `in-progress`: at least one candidate is actively running (NotStarted / InProgress / Postponed) and none have succeeded yet. Retrying later may help.
 * - `all-failed`: every candidate completed but none succeeded.
 * - `no-id`: at least one candidate Succeeded but is missing an `id` — an ADO state anomaly that shouldn't happen in practice.
 */
export type ArtifactLookupFailure =
	| { kind: "no-build" }
	| { kind: "in-progress" }
	| { kind: "all-failed" }
	| { kind: "no-id" };

/**
 * Outcome of looking up a build for a {@link BuildMatch}. `completed` carries
 * the usable build's id; the failure variants are {@link ArtifactLookupFailure}.
 */
export type FindBuildIdResult = { kind: "completed"; buildId: number } | ArtifactLookupFailure;

/**
 * Find a usable build matching `match` — one with an id, status Completed,
 * and result Succeeded. Scans all matches (a SHA can map to multiple builds
 * via re-runs/retries), not just the first. Prioritizes "still running" over
 * "all failed" in the failure cases since retrying later may help.
 */
function findBuildId(builds: Build[], match: BuildMatch): FindBuildIdResult {
	const candidates = builds.filter((b) => buildMatches(b, match));

	if (candidates.length === 0) {
		return { kind: "no-build" };
	}

	const usable = candidates.find(
		(b): b is Build & { id: number } =>
			b.id !== undefined &&
			b.status === BuildStatus.Completed &&
			b.result === BuildResult.Succeeded,
	);
	if (usable !== undefined) {
		return { kind: "completed", buildId: usable.id };
	}

	// Report the most actionable failure state. Actively-running gets priority
	// (user might just wait); Cancelling is *not* in that bucket — it's heading
	// toward Canceled.
	const isActivelyRunning = (b: Build): boolean =>
		b.status === BuildStatus.NotStarted ||
		b.status === BuildStatus.InProgress ||
		b.status === BuildStatus.Postponed;
	if (candidates.some(isActivelyRunning)) {
		return { kind: "in-progress" };
	}
	if (candidates.every((b) => b.result !== BuildResult.Succeeded)) {
		return { kind: "all-failed" };
	}
	// At least one candidate Succeeded but is missing an `id` — an ADO state
	// anomaly that shouldn't happen, but `id` is typed `number | undefined`.
	return { kind: "no-id" };
}

export interface GetArtifactForCommitArgs {
	/** A connection to the ADO API. */
	adoApi: WebApi;
	/** Name of the pipeline artifact to fetch. */
	artifactName: string;
	/** Which build to look up — see {@link BuildMatch}. */
	match: BuildMatch;
	/** ID of the ADO pipeline whose builds to search. */
	definitionId: number;
	/** The ADO project name. */
	project: string;
}

/**
 * Outcome of fetching an artifact for a {@link BuildMatch}. `completed` carries
 * the downloaded artifact contents; the failure variants are
 * {@link ArtifactLookupFailure}. Download failures (network, malformed zip,
 * etc.) still propagate as thrown exceptions.
 */
export type GetArtifactForCommitResult =
	| { kind: "completed"; contents: ArtifactContents }
	| ArtifactLookupFailure;

/**
 * Fetch one artifact from the ADO build that `match` identifies.
 *
 * @returns A {@link GetArtifactForCommitResult}: `completed` with the
 * artifact contents on the happy path, or one of the failure kinds when no
 * usable build is found. Download failures still throw (unexpected and
 * propagate from `downloadArtifact`).
 */
export async function getArtifactForCommit(
	args: GetArtifactForCommitArgs,
): Promise<GetArtifactForCommitResult> {
	const { adoApi, artifactName, match, definitionId, project } = args;

	const builds = await getBuilds(adoApi, {
		project,
		definitions: [definitionId],
		maxBuildsPerDefinition: recentBuildsToFetch,
	});
	const lookup = findBuildId(builds, match);
	if (lookup.kind !== "completed") {
		return lookup;
	}

	const contents = await downloadArtifact(adoApi, project, lookup.buildId, artifactName);
	return { kind: "completed", contents };
}

/**
 * Human-readable message for an {@link ArtifactLookupFailure}, given the
 * originating {@link BuildMatch} that produced it.
 */
export function describeArtifactFailure(
	match: BuildMatch,
	failure: ArtifactLookupFailure,
): string {
	const subject = describeMatch(match);
	switch (failure.kind) {
		case "no-build":
			return `No build found for ${subject}.`;
		case "in-progress":
			return `Found an in-progress build for ${subject}; none have succeeded yet.`;
		case "all-failed":
			return `All builds for ${subject} have completed but none succeeded.`;
		case "no-id":
			return `No build for ${subject} has a usable build id.`;
		default:
			throw new Error(
				`Unhandled ArtifactLookupFailure kind: ${(failure as { kind: string }).kind}`,
			);
	}
}
