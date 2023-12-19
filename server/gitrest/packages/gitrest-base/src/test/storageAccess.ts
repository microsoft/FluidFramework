/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IFileSystemPromises } from "../utils";
import { ISummaryTestMode } from "./utils";

export type StorageAccessCallCounts = { [K in keyof IFileSystemPromises]?: number };

/**
 * These baseline storage access counts are set based on
 * tests run against commit 7620034bac63c5e3c4cb85f666a41c46012e8a49 on Dec 13, 2023.
 *
 * Test pattern for full test is as follows, with a new GitWholeSummaryManager for each step (no local cache):
 * 1. Write initial summary.
 * 2. Read "latest" summary.
 * 3. Write Channel summary.
 * 4. Read "latest" summary.
 * 5. Write Container summary.
 * 6. Read "latest" summary.
 * 7. Read initial summary by Sha.
 *
 * Maintaining these storage counts (or reducing them) is important for performance in systems
 * where storage access is expensive (e.g. remote storage in a distant geographical region).
 *
 * These baseline tests were run with no other optimizations.
 * ```json
 * {
 *   "enableLowIoWrite":true, <-- This is the only optimization enabled/disabled.
 *   "repoPerDocEnabled":false,
 *   "enableOptimizedInitialSummary":false,
 *   "enableSlimGitInit":false
 * }
 * ```
 */

const initialWriteStorageAccessBaselinePerformance: StorageAccessCallCounts = {
	readFile: 23,
	writeFile: 79,
	mkdir: 56,
	stat: 46,
};
const initialWriteStorageAccessBaselinePerformanceLowIo: StorageAccessCallCounts = {
	readFile: 9,
	writeFile: 9,
	mkdir: 21,
	stat: 11,
};

const fullTestStorageAccessBaselinePerformance: StorageAccessCallCounts = {
	readFile: 259,
	writeFile: 115,
	mkdir: 71,
	stat: 92,
};
const fullTestStorageAccessBaselinePerformanceLowIo: StorageAccessCallCounts = {
	readFile: 62,
	writeFile: 20,
	mkdir: 26,
	stat: 18,
};

function assertBaselineMaintained(
	baseline: StorageAccessCallCounts,
	actual: StorageAccessCallCounts,
) {
	for (const key of Object.keys(baseline)) {
		assert(
			actual[key] <= baseline[key],
			`Storage access count for ${key} exceeded baseline. Expected ${baseline[key]}, got ${actual[key]}`,
		);
	}
	// const baselineSum = Object.values(baseline).reduce((a, b) => a + b, 0);
	// const actualSum = Object.values(actual).reduce((a, b) => a + b, 0);
	// process.stdout.write(
	// 	`Storage access count baseline maintained. Expected ${baselineSum}, got ${actualSum}\n${JSON.stringify(
	// 		actual,
	// 	)}\n`,
	// );
}

export function checkInitialWriteStorageAccessBaselinePerformance(
	testMode: ISummaryTestMode,
	callCount: StorageAccessCallCounts,
) {
	const _baseline = testMode.enableLowIoWrite
		? initialWriteStorageAccessBaselinePerformanceLowIo
		: initialWriteStorageAccessBaselinePerformance;
	const baseline = { ..._baseline };
	if (testMode.repoPerDocEnabled) {
		// repoPerDoc adds a small amount of overhead for `mkdir`.
		baseline.mkdir += 2;
	}
	assertBaselineMaintained(baseline, callCount);
}
export function checkFullStorageAccessBaselinePerformance(
	testMode: ISummaryTestMode,
	callCount: StorageAccessCallCounts,
) {
	const _baseline = testMode.enableLowIoWrite
		? fullTestStorageAccessBaselinePerformanceLowIo
		: fullTestStorageAccessBaselinePerformance;
	const baseline = { ..._baseline };
	if (testMode.repoPerDocEnabled) {
		// repoPerDoc adds a small amount of overhead for `mkdir`.
		baseline.mkdir += 2;
	}
	assertBaselineMaintained(baseline, callCount);
}
