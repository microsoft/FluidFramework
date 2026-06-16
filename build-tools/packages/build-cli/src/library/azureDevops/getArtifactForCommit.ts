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
 * Find a usable build matching `match` — one with an id, status Completed,
 * and result Succeeded. Scans all matches (a SHA can map to multiple builds
 * via re-runs/retries), not just the first.
 *
 * @returns The build id. Throws with a human-readable message when no usable
 * build is found, prioritizing "still running" over "all failed".
 */
function findBuildId(builds: Build[], match: BuildMatch): number {
	const candidates = builds.filter((b) => buildMatches(b, match));
	const subject = describeMatch(match);

	if (candidates.length === 0) {
		throw new Error(`No build found for ${subject}`);
	}

	const usable = candidates.find(
		(b): b is Build & { id: number } =>
			b.id !== undefined &&
			b.status === BuildStatus.Completed &&
			b.result === BuildResult.Succeeded,
	);
	if (usable !== undefined) {
		return usable.id;
	}

	// Report the most actionable failure state. Actively-running gets priority
	// (user might just wait); Cancelling is *not* in that bucket — it's heading
	// toward Canceled.
	const isActivelyRunning = (b: Build): boolean =>
		b.status === BuildStatus.NotStarted ||
		b.status === BuildStatus.InProgress ||
		b.status === BuildStatus.Postponed;
	if (candidates.some(isActivelyRunning)) {
		throw new Error(`Found an in-progress build for ${subject}; none have succeeded yet.`);
	}
	if (candidates.every((b) => b.result !== BuildResult.Succeeded)) {
		throw new Error(`All builds for ${subject} have completed but none succeeded.`);
	}
	// At least one candidate Succeeded but is missing an `id` — an ADO state
	// anomaly that shouldn't happen, but `id` is typed `number | undefined`.
	throw new Error(`No build for ${subject} has a usable build id.`);
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
 * Fetch one artifact from the ADO build that `match` identifies.
 *
 * @returns The artifact's {@link ArtifactContents}. Throws when no usable
 * build is found (see {@link BuildMatch}); download failures propagate from
 * `downloadArtifact`.
 */
export async function getArtifactForCommit(
	args: GetArtifactForCommitArgs,
): Promise<ArtifactContents> {
	const { adoApi, artifactName, match, definitionId, project } = args;

	const builds = await getBuilds(adoApi, {
		project,
		definitions: [definitionId],
		maxBuildsPerDefinition: recentBuildsToFetch,
	});
	const buildId = findBuildId(builds, match);

	return downloadArtifact(adoApi, project, buildId, artifactName);
}
