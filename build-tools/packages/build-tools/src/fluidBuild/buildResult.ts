/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export enum BuildResult {
	Success,
	UpToDate,
	Failed,
	/**
	 * Task succeeded by restoring outputs from shared cache instead of executing.
	 */
	CachedSuccess,
	/**
	 * Task succeeded by executing and outputs were successfully written to cache.
	 */
	SuccessWithCacheWrite,
	/**
	 * Task was up-to-date based on local donefile cache (no execution or remote cache needed).
	 */
	LocalCacheHit,
}

/**
 * Summarizes a collection of build results into a single build result.
 * @returns The summarized build result.
 * If any failed, failure is returned.
 * If there is at least one success (including cached success) and no failures, success is returned.
 * Otherwise (when there are no results or all are up-to-date) up-to-date is returned.
 */
export function summarizeBuildResult(results: readonly BuildResult[]): BuildResult {
	let retResult = BuildResult.UpToDate;
	for (const result of results) {
		if (result === BuildResult.Failed) {
			return BuildResult.Failed;
		}

		if (
			result === BuildResult.Success ||
			result === BuildResult.CachedSuccess ||
			result === BuildResult.SuccessWithCacheWrite ||
			result === BuildResult.LocalCacheHit
		) {
			retResult = BuildResult.Success;
		}
	}
	return retResult;
}
