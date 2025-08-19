/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export enum BuildResult {
	Success,
	UpToDate,
	Failed,
}

/**
 * Summarizes a collection of build results into a single build result.
 * @returns The summarized build result.
 * If any failed, failure is returned.
 * If there is at least one success and no failures, success is returned.
 * Otherwise (when there are no results or all are up-to-date) up-to-date is returned.
 */
export function summarizeBuildResult(results: readonly BuildResult[]): BuildResult {
	let retResult = BuildResult.UpToDate;
	for (const result of results) {
		if (result === BuildResult.Failed) {
			return BuildResult.Failed;
		}

		if (result === BuildResult.Success) {
			retResult = BuildResult.Success;
		}
	}
	return retResult;
}
