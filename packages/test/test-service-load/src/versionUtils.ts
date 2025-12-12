/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { pkgVersion } from "./packageVersion.js";

/**
 * Represents version information for mixed-version testing
 */
export interface VersionInfo {
	current: string;
	previousMajor: string;
}

/**
 * Parse a version string into major.minor.patch components
 */
function parseVersion(version: string): { major: number; minor: number; patch: number } {
	const parts = version.split(".");
	if (parts.length !== 3) {
		throw new TypeError(`Invalid version format: ${version}. Expected major.minor.patch`);
	}

	const majorStr = parts[0];
	const minorStr = parts[1];
	const patchStr = parts[2];

	if (majorStr === undefined || minorStr === undefined || patchStr === undefined) {
		throw new TypeError(`Invalid version format: ${version}. Missing version parts`);
	}

	const major = parseInt(majorStr, 10);
	const minor = parseInt(minorStr, 10);
	const patch = parseInt(patchStr, 10);

	if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
		throw new TypeError(`Invalid version format: ${version}. All parts must be numbers`);
	}

	return { major, minor, patch };
}

/**
 * Compare two version strings. Returns true if v1 \>= v2
 */
function isVersionGreaterOrEqual(v1: string, v2: string): boolean {
	const version1 = parseVersion(v1);
	const version2 = parseVersion(v2);

	if (version1.major !== version2.major) {
		return version1.major > version2.major;
	}

	if (version1.minor !== version2.minor) {
		return version1.minor > version2.minor;
	}

	return version1.patch >= version2.patch;
}

/**
 * Calculate the previous major version based on current version.
 * For versions like 2.7X.0, returns 2.6X.0 format.
 *
 * @param currentVersion - Current package version (e.g., "2.72.0")
 * @returns Previous major version (e.g., "2.60.0" for N-1)
 */
export function calculatePreviousMajorVersion(currentVersion: string): string {
	const parsed = parseVersion(currentVersion);

	// For Fluid Framework, "major" releases are actually represented as minor versions
	// in the 2.x series. So 2.70.0 -> 2.60.0, 2.60.0 -> 2.50.0, etc.
	const currentMinor = parsed.minor;

	// Calculate the previous "major" (minor in semver terms) release
	// Fluid releases are typically in increments of 10: 2.10, 2.20, 2.30, etc.
	// But we need to handle cases where the current version might not be exactly on that boundary
	let previousMinor: number;

	if (currentMinor >= 10) {
		// Round down to the nearest 10 and subtract 10
		const currentMajorMinor = Math.floor(currentMinor / 10) * 10;
		previousMinor = Math.max(0, currentMajorMinor - 10);
	} else {
		// If we're in the first major release of a series, go to previous major
		if (parsed.major > 1) {
			// Go to previous major version, e.g., 2.5.0 -> 1.90.0 (hypothetically)
			return `${parsed.major - 1}.90.0`;
		} else {
			// Can't go back further than 1.0.0
			previousMinor = 0;
		}
	}

	return `${parsed.major}.${previousMinor}.0`;
}

/**
 * Get version information for mixed-version testing
 */
export function getVersionInfo(previousVersionOverride?: string): VersionInfo {
	const current = pkgVersion;
	const previousMajor = previousVersionOverride ?? calculatePreviousMajorVersion(current);

	// Validate that the previous version is actually older
	if (isVersionGreaterOrEqual(previousMajor, current)) {
		throw new Error(
			`Previous version ${previousMajor} must be older than current version ${current}`,
		);
	}

	return {
		current,
		previousMajor,
	};
}

/**
 * Determine which version a runner should use based on its index and the ratio of previous version clients
 */
export function getRunnerVersion(
	runnerIndex: number,
	totalRunners: number,
	previousVersionRatio: number,
	versionInfo: VersionInfo,
): { version: string; isPreviousVersion: boolean } {
	assert(
		previousVersionRatio >= 0 && previousVersionRatio <= 1,
		"previousVersionRatio must be between 0 and 1",
	);

	const numberOfPreviousVersionClients = Math.floor(totalRunners * previousVersionRatio);
	const isPreviousVersion = runnerIndex < numberOfPreviousVersionClients;

	return {
		version: isPreviousVersion ? versionInfo.previousMajor : versionInfo.current,
		isPreviousVersion,
	};
}

/**
 * Generate a runner executable path based on version
 * For current version, use the standard path
 * For previous versions, use the legacy installation path
 */
export function getRunnerExecutablePath(version: string, isPreviousVersion: boolean): string {
	if (!isPreviousVersion) {
		return "./dist/runner.js";
	}

	// For previous versions, we'll need to use the test-version-utils infrastructure
	// to install and load the previous version
	// For now, we'll use a placeholder path that the actual runner spawning logic will handle
	return `./node_modules/.legacy/${version}/dist/runner.js`;
}
