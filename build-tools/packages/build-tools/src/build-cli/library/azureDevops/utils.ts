/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { WebApi } from "azure-devops-node-api";
import {
	type Build,
	BuildQueryOrder,
} from "azure-devops-node-api/interfaces/BuildInterfaces.js";

export interface GetBuildOptions {
	/**
	 * The ADO project name
	 */
	project: string;

	/**
	 * An array of ADO definitions that should be considered for this query.
	 */
	definitions: number[];

	/**
	 * An optional set of tags that should be on the returned builds.
	 */
	tagFilters?: string[];

	/**
	 * An upper limit on the number of queries to return. Can be used to improve performance
	 */
	maxBuildsPerDefinition?: number;

	/**
	 * Name of the branch for which the builds are being fetched.
	 */
	branch?: string;
}

/**
 * A wrapper around the terrible API signature for ADO getBuilds
 */
export async function getBuilds(
	adoConnection: WebApi,
	options: GetBuildOptions,
	build_id?: string,
): Promise<Build[]> {
	const buildApi = await adoConnection.getBuildApi();

	return buildApi.getBuilds(
		options.project,
		options.definitions,
		undefined /* queues */,
		build_id,
		undefined /* minTime */,
		undefined /* maxTime */,
		undefined /* requestedFor */,
		undefined /* reasonFilter */,
		undefined /* BuildStatus */,
		undefined /* BuildResult */,
		options.tagFilters,
		undefined /* properties */,
		undefined /* top */,
		undefined /* continuationToken */,
		options.maxBuildsPerDefinition,
		undefined /* deletedFilter */,
		BuildQueryOrder.QueueTimeDescending,
		options.branch,
	);
}

/**
 * A wrapper around the API signature for ADO getBuild
 */
export async function getBuild(
	adoConnection: WebApi,
	options: GetBuildOptions,
	buildId: number,
): Promise<Build> {
	const buildApi = await adoConnection.getBuildApi();

	return buildApi.getBuild(options.project, buildId);
}
