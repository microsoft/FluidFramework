/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { isInternalVersionScheme } from "@fluid-tools/version-tools";
import * as semver from "semver";

/**
 * The result of checking whether a version is the latest stable version for its major.
 */
export type LatestVersionCheckResult =
	| { isLatest: true; majorVersion: number }
	| { isLatest: false; latestVersion: string | undefined; majorVersion: number };

/**
 * Determines whether `inputVersion` is the latest stable version for its semver major
 * among the provided `allVersions` list.
 *
 * @param allVersions - All version strings to consider (may include internal/prerelease versions).
 * @param inputVersion - The version string to check.
 * @returns A {@link LatestVersionCheckResult} describing the outcome.
 */
export function isLatestInMajor(
	allVersions: string[],
	inputVersion: string,
): LatestVersionCheckResult {
	const stableVersions = allVersions
		.filter((v) => !isInternalVersionScheme(v))
		.sort((a, b) => semver.rcompare(a, b));

	const inputMajorVersion = semver.major(inputVersion);

	for (const v of stableVersions) {
		const majorVersion = semver.major(v);
		if (majorVersion === inputMajorVersion) {
			if (v === inputVersion) {
				return { isLatest: true, majorVersion };
			}
			return { isLatest: false, latestVersion: v, majorVersion };
		}
	}

	return { isLatest: false, latestVersion: undefined, majorVersion: inputMajorVersion };
}
