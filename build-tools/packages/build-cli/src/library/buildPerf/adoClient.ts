/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getAzureDevopsApi } from "@fluidframework/bundle-size-tools";
import type { IBuildApi } from "azure-devops-node-api/BuildApi.js";
import type { Build, Timeline } from "azure-devops-node-api/interfaces/BuildInterfaces.js";
import {
	BuildQueryOrder,
	BuildReason,
	BuildResult,
	BuildStatus,
} from "azure-devops-node-api/interfaces/BuildInterfaces.js";
import type { AdoBuildRecord, AdoTimeline, BuildPerfMode } from "./types.js";

/**
 * Options for fetching builds from ADO.
 */
export interface FetchBuildsOptions {
	adoToken: string;
	org: string;
	project: string;
	mode: BuildPerfMode;
	buildCount: number;
	prBuildDefId?: number;
	internalBuildDefId?: number;
}

/**
 * Options for fetching timeline data from ADO.
 */
export interface FetchTimelinesOptions {
	adoToken: string;
	org: string;
	project: string;
	buildIds: number[];
	parallelJobs: number;
}

/**
 * Logger interface for ADO client operations.
 */
export interface AdoClientLogger {
	log: (message: string, ...args: unknown[]) => void;
	warning: (message: string | Error, ...args: unknown[]) => string | Error | void;
	verbose: (message: string | Error, ...args: unknown[]) => string | Error | void;
}

/**
 * Run async tasks with a concurrency limit.
 */
async function runWithConcurrency<T>(
	items: T[],
	limit: number,
	fn: (item: T) => Promise<void>,
): Promise<void> {
	let index = 0;
	async function worker(): Promise<void> {
		while (index < items.length) {
			const currentIndex = index++;
			await fn(items[currentIndex]);
		}
	}
	const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
	await Promise.all(workers);
}

/**
 * Create a build API client from ADO credentials.
 */
async function getBuildApi(token: string, org: string): Promise<IBuildApi> {
	const orgUrl = `https://dev.azure.com/${org}`;
	const connection = getAzureDevopsApi(token, orgUrl);
	return connection.getBuildApi();
}

/**
 * Convert a raw ADO Build object to our AdoBuildRecord type.
 */
function toAdoBuildRecord(build: Build): AdoBuildRecord {
	return {
		id: build.id!,
		startTime: build.startTime?.toISOString() ?? "",
		finishTime: build.finishTime?.toISOString() ?? "",
		result: build.result === BuildResult.Succeeded ? "succeeded" : "partiallySucceeded",
		sourceBranch: build.sourceBranch ?? "",
		sourceVersion: build.sourceVersion,
		parameters: build.parameters,
	};
}

/**
 * Convert a raw ADO Timeline object to our AdoTimeline type.
 */
function toAdoTimeline(timeline: Timeline): AdoTimeline {
	return {
		records: (timeline.records ?? []).map((r) => ({
			id: r.id ?? "",
			parentId: r.parentId ?? undefined,
			type: r.type ?? "",
			name: r.name ?? "",
			startTime: r.startTime?.toISOString(),
			finishTime: r.finishTime?.toISOString(),
		})),
	};
}

/**
 * Fetch build records from Azure DevOps.
 *
 * Public mode: fetches PR builds (succeeded/partiallySucceeded, completed).
 * Internal mode: fetches main branch builds (succeeded/partiallySucceeded, completed).
 */
export async function fetchBuilds(
	options: FetchBuildsOptions,
	logger?: AdoClientLogger,
): Promise<AdoBuildRecord[]> {
	const { adoToken, org, project, mode, buildCount, prBuildDefId, internalBuildDefId } =
		options;

	const buildDefId = mode === "public" ? prBuildDefId : internalBuildDefId;
	if (buildDefId === undefined) {
		throw new Error(
			`Build definition ID is required for ${mode} mode (${mode === "public" ? "prBuildDefId" : "internalBuildDefId"})`,
		);
	}

	logger?.log(`Fetching ${buildCount} ${mode} builds (definition ${buildDefId})...`);

	const buildApi = await getBuildApi(adoToken, org);

	// Use the ADO SDK getBuilds with appropriate filters
	// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
	const reasonFilter = mode === "public" ? BuildReason.PullRequest : undefined;
	const branchName = mode === "internal" ? "refs/heads/main" : undefined;

	const builds = await buildApi.getBuilds(
		project,
		[buildDefId] /* definitions */,
		undefined /* queues */,
		undefined /* buildNumber */,
		undefined /* minTime */,
		undefined /* maxTime */,
		undefined /* requestedFor */,
		reasonFilter,
		BuildStatus.Completed /* statusFilter */,
		// Combine succeeded and partiallySucceeded (bit flags)
		// eslint-disable-next-line no-bitwise
		(BuildResult.Succeeded | BuildResult.PartiallySucceeded) as BuildResult,
		undefined /* tagFilters */,
		undefined /* properties */,
		buildCount /* top */,
		undefined /* continuationToken */,
		undefined /* maxBuildsPerDefinition */,
		undefined /* deletedFilter */,
		BuildQueryOrder.StartTimeDescending,
		branchName,
	);

	logger?.log(`Fetched ${builds.length} builds`);

	return builds.filter((b) => b.id !== undefined).map(toAdoBuildRecord);
}

/**
 * Fetch timeline data for multiple builds from Azure DevOps, with concurrency control.
 *
 * @returns A map of buildId (as string) to AdoTimeline.
 */
export async function fetchTimelines(
	options: FetchTimelinesOptions,
	logger?: AdoClientLogger,
): Promise<Record<string, AdoTimeline>> {
	const { adoToken, org, project, buildIds, parallelJobs } = options;

	logger?.log(
		`Fetching timeline data for ${buildIds.length} builds (${parallelJobs} concurrent)...`,
	);

	const buildApi = await getBuildApi(adoToken, org);
	const results: Record<string, AdoTimeline> = {};
	let successCount = 0;
	let errorCount = 0;

	await runWithConcurrency(buildIds, parallelJobs, async (buildId: number) => {
		try {
			const timeline = await buildApi.getBuildTimeline(project, buildId);
			if (timeline?.records) {
				results[String(buildId)] = toAdoTimeline(timeline);
				successCount++;
			} else {
				logger?.verbose(`Build ${buildId}: No timeline records`);
				errorCount++;
			}
		} catch (error) {
			logger?.verbose(`Build ${buildId}: Failed to fetch timeline - ${error}`);
			errorCount++;
		}

		// Progress logging every 50 builds
		const processed = successCount + errorCount;
		if (processed % 50 === 0) {
			logger?.log(`[${processed}/${buildIds.length}] Fetched timeline data...`);
		}
	});

	logger?.log(`Timeline data fetched: ${successCount} successful, ${errorCount} failed`);

	if (successCount === 0 && buildIds.length > 0) {
		throw new Error("All timeline fetches failed");
	}

	return results;
}
