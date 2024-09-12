/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { WebApi } from "azure-devops-node-api";
import {
	type Build,
	BuildQueryOrder,
} from "azure-devops-node-api/interfaces/BuildInterfaces.js";
import execa from "execa";

export interface GetBuildOptions {
	// The ADO project name
	project: string;

	// An array of ADO definitions that should be considered for this query
	definitions: number[];

	// An optional set of tags that should be on the returned builds
	tagFilters?: string[];

	// An upper limit on the number of queries to return. Can be used to improve performance
	maxBuildsPerDefinition?: number;
}

/**
 * Gets the commit in master that the current branch is based on.
 */
export function getBaselineCommit(): string {
	const result = execa.commandSync(
		`git merge-base microsoft/${process.env.TARGET_BRANCH_NAME} HEAD`,
	);
	return result.stdout.toString().trim();
}

export function getPriorCommit(baseCommit: string): string {
	const result = execa.commandSync(`git log --pretty=format:"%H" -1 ${baseCommit}~1`);
	return result.stdout.toString().trim();
}

/**
 * A wrapper around the terrible API signature for ADO getBuilds
 */
export async function getBuilds(
	adoConnection: WebApi,
	options: GetBuildOptions,
): Promise<Build[]> {
	const buildApi = await adoConnection.getBuildApi();

	return buildApi.getBuilds(
		options.project,
		options.definitions,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		options.tagFilters,
		undefined,
		undefined,
		undefined,
		options.maxBuildsPerDefinition,
		undefined,
		BuildQueryOrder.QueueTimeDescending,
	);
}

function createMessage(
	heading: string,
	message: string,
	baselineCommit: string,
	baselineBuildInfo: Build,
): string {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	const linkToBaselineBuild = baselineBuildInfo._links?.web.href as string;
	return `${heading}\n
	<p>${message}</p>\n
	Baseline build: <a target="_blank" href="${linkToBaselineBuild}">${baselineCommit}</a>`;
}

export type Metric = "codeCoverage";

/**
 * Gets a simple HTML message with the footer for the baseline commit
 *
 * @param message - the string to type as a message
 * @param baselineCommit - Commit hash for the baseline
 * @param baselineBuildInfo - Build information to create the comment with.
 * @param metric - Name of the metric either bundleBuddy or codeCoverage
 */
export function getSimpleComment(
	message: string,
	baselineCommit: string,
	baselineBuildInfo: Build,
	metric: Metric,
): string {
	switch (metric) {
		case "codeCoverage": {
			return createMessage(
				"## Code coverage summary",
				message,
				baselineCommit,
				baselineBuildInfo,
			);
		}
		default: {
			throw exhaustiveTypeCheck(metric);
		}
	}
}

/**
 * Used as an exhaustive check for types in switch or if statements.
 * Trying to assign any type to the value parameter in this function will always fail
 * the type check unless it is impossible to reach that line of code (the never type).
 * In the rare occasion (failed exhaustive type check) that this function is called at runtime,
 * it will throw an error to signal that the method should not have been called.
 *
 * @param value - The value that should be of type never (exhaustively type checked before calling this function)
 * @returns Does not return, it always throws an error to signal that this function was called at runtime.
 */
function exhaustiveTypeCheck(value: never): Error {
	return new Error(
		`Value ${value} was not exhaustively type checked, this function should not be run at runtime`,
	);
}
