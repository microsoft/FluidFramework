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

/**
 * Logs the result of a latest-version check and emits Azure DevOps pipeline
 * variables (`shouldDeploy`, `majorVersion`) via `##vso` logging commands.
 *
 * @param log - A logging function (typically `this.log` from an oclif command).
 * @param inputVersion - The version string that was checked.
 * @param result - The result returned by {@link isLatestInMajor}.
 */
export function logLatestVersionResult(
	log: (msg: string) => void,
	inputVersion: string,
	result: LatestVersionCheckResult,
): void {
	if (result.isLatest) {
		log(
			`Version ${inputVersion} is the latest version for major version ${result.majorVersion}`,
		);
		log(`##vso[task.setvariable variable=shouldDeploy;isoutput=true]true`);
		log(`##vso[task.setvariable variable=majorVersion;isoutput=true]${result.majorVersion}`);
		return;
	}

	if (result.latestVersion !== undefined) {
		log(
			`##[warning]skipping deployment stage. input version ${inputVersion} does not match the latest version ${result.latestVersion}`,
		);
	} else {
		log(`##[warning]No major version found corresponding to input version ${inputVersion}`);
	}

	log(`##vso[task.setvariable variable=shouldDeploy;isoutput=true]false`);
	log(`##vso[task.setvariable variable=majorVersion;isoutput=true]${result.majorVersion}`);
}
