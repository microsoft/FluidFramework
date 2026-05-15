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

// Upper bound on builds fetched when searching for one matching a target commit.
// ADO has no API to query builds by commit SHA, so this window size determines
// how stale a target commit can be relative to the pipeline's recent activity
// and still be findable.
const recentBuildsToFetch = 100;

/**
 * Wrapper around the unwieldy positional signature of ADO's `getBuilds`.
 */
async function getRecentBuilds(
	adoApi: WebApi,
	project: string,
	definitionId: number,
): Promise<Build[]> {
	const buildApi = await adoApi.getBuildApi();
	return buildApi.getBuilds(
		project,
		[definitionId],
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		recentBuildsToFetch,
	);
}

/**
 * Find the build for `commit` in `builds` and validate that it has an id,
 * is completed, and succeeded.
 *
 * @returns The build id. Throws with a human-readable message when no usable
 * build is found.
 */
function findBuildIdForCommit(builds: Build[], commit: string): number {
	const build = builds.find((b) => b.sourceVersion === commit);

	if (build === undefined) {
		throw new Error(`No build found for commit ${commit}`);
	}
	if (build.id === undefined) {
		throw new Error(`Build for commit ${commit} does not have a build id`);
	}
	if (build.status !== BuildStatus.Completed) {
		throw new Error(`Build for commit ${commit} has not yet completed.`);
	}
	if (build.result !== BuildResult.Succeeded) {
		throw new Error(`Build for commit ${commit} did not succeed.`);
	}

	return build.id;
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

	const builds = await getRecentBuilds(adoApi, project, definitionId);
	const buildId = findBuildIdForCommit(builds, commit);

	try {
		return await downloadArtifact(adoApi, project, buildId, artifactName);
	} catch (e) {
		throw new Error(`Could not download artifact "${artifactName}" for commit ${commit}`, {
			cause: e,
		});
	}
}
