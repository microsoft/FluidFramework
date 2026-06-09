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

// Upper bound on builds fetched when searching for one matching a target commit.
// ADO has no API to query builds by commit SHA, so this window size determines
// how stale a target commit can be relative to the pipeline's recent activity
// and still be findable.
const recentBuildsToFetch = 100;

/**
 * How to identify the ADO build for a SHA.
 *
 * - `commit`: match `Build.sourceVersion` directly. Use for builds queued
 *   against a real commit on a branch/tag (main, release branches, …).
 * - `prHead`: match `Build.triggerInfo['pr.sourceSha']`. PR-triggered builds
 *   record the GitHub-generated test-merge SHA on `sourceVersion` (opaque,
 *   ephemeral) and the actual PR HEAD SHA on `triggerInfo['pr.sourceSha']` —
 *   so use this kind when the caller knows the PR HEAD, not the test-merge.
 */
export type BuildMatch = { kind: "commit"; sha: string } | { kind: "prHead"; sha: string };

/** Human-readable label for the SHA `match` is keyed by, used in error messages. */
function describeMatch(match: BuildMatch): string {
	return match.kind === "commit" ? `commit ${match.sha}` : `PR HEAD ${match.sha}`;
}

/**
 * `true` if `b` is the build `match` identifies — see {@link BuildMatch}.
 */
function buildMatches(b: Build, match: BuildMatch): boolean {
	if (match.kind === "commit") {
		return b.sourceVersion === match.sha;
	}
	// `triggerInfo` is not in azure-devops-node-api's `Build` type but is
	// included in the REST response for PR-triggered builds.
	return (
		(b as unknown as { triggerInfo?: Record<string, string> }).triggerInfo?.[
			"pr.sourceSha"
		] === match.sha
	);
}

/**
 * Find a usable build matching `match` in `builds` — one with an id, status
 * Completed, and result Succeeded. A SHA can map to more than one ADO build
 * (manual re-run, partial-success retry, …), so scan all matches rather than
 * locking onto the first one ADO returned.
 *
 * @returns The build id. Throws with a human-readable message when no usable
 * build is found, prioritizing "not yet completed" over "did not succeed"
 * since retrying later might help.
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

	// No usable found — report the most actionable state across the candidates.
	// "Actively running" gets priority since the user might just need to wait;
	// Cancelling is *not* in that bucket because it's heading toward Canceled.
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
	// Reaching here means at least one candidate Succeeded but is missing an
	// `id` (possibly alongside other failed candidates) — an ADO state anomaly
	// that shouldn't happen in practice, but the `id` field is typed
	// `number | undefined` so we surface it explicitly.
	throw new Error(`No build for ${subject} has a usable build id.`);
}

export interface GetArtifactForCommitArgs {
	/** A connection to the ADO API. */
	adoApi: WebApi;
	/** Name of the pipeline artifact to fetch. */
	artifactName: string;
	/** Which SHA — and on which field — to identify the build by. */
	match: BuildMatch;
	/** ID of the ADO pipeline whose builds to search. */
	definitionId: number;
	/** The ADO project name. */
	project: string;
}

/**
 * Look up the build identified by `match` on the given ADO pipeline and
 * return the contents of one of its artifacts.
 *
 * @returns The artifact's {@link ArtifactContents}. Throws with a
 * human-readable message when no usable build is found (missing, incomplete,
 * failed); download failures propagate directly from `downloadArtifact`.
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
