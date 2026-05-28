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
 * Find a usable build for `commit` in `builds` — one with an id, status
 * Completed, and result Succeeded. A commit can have more than one ADO build
 * (manual re-run, partial-success retry, …), so scan all matches rather than
 * locking onto the first one ADO returned.
 *
 * @returns The build id. Throws with a human-readable message when no usable
 * build is found, prioritizing "not yet completed" over "did not succeed"
 * since retrying later might help.
 */
function findBuildIdForCommit(builds: Build[], commit: string): number {
	const candidates = builds.filter((b) => b.sourceVersion === commit);

	if (candidates.length === 0) {
		throw new Error(`No build found for commit ${commit}`);
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
		throw new Error(
			`Found an in-progress build for commit ${commit}; none have succeeded yet.`,
		);
	}
	if (candidates.every((b) => b.result !== BuildResult.Succeeded)) {
		throw new Error(`All builds for commit ${commit} have completed but none succeeded.`);
	}
	// Reaching here means at least one candidate Succeeded but is missing an
	// `id` (possibly alongside other failed candidates) — an ADO state anomaly
	// that shouldn't happen in practice, but the `id` field is typed
	// `number | undefined` so we surface it explicitly.
	throw new Error(`No build for commit ${commit} has a usable build id.`);
}

export interface GetArtifactForCommitArgs {
	/** A connection to the ADO API. */
	adoApi: WebApi;
	/** Name of the pipeline artifact to fetch. */
	artifactName: string;
	/** Commit whose build to look up. */
	commit: string;
	/** ID of the ADO pipeline whose builds to search. */
	definitionId: number;
	/** The ADO project name. */
	project: string;
}

/**
 * Look up the build for `commit` on the given ADO pipeline and return the
 * contents of one of its artifacts.
 *
 * @returns The artifact's {@link ArtifactContents}. Throws with a
 * human-readable message when no usable build is found (missing, incomplete,
 * failed) or the artifact can't be downloaded.
 */
export async function getArtifactForCommit(
	args: GetArtifactForCommitArgs,
): Promise<ArtifactContents> {
	const { adoApi, artifactName, commit, definitionId, project } = args;

	const builds = await getBuilds(adoApi, {
		project,
		definitions: [definitionId],
		maxBuildsPerDefinition: recentBuildsToFetch,
	});
	const buildId = findBuildIdForCommit(builds, commit);

	try {
		return await downloadArtifact(adoApi, project, buildId, artifactName);
	} catch (e) {
		throw new Error(`Could not download artifact "${artifactName}" for commit ${commit}`, {
			cause: e,
		});
	}
}
