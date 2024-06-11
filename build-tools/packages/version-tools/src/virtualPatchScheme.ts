/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import * as semver from "semver";

import { VersionBumpType } from "./bumpTypes";

/**
 * The virtualPatch format uses this value to encode and decode versions in that scheme.
 */
const VIRTUAL_PATCH_FORMAT_MULTIPLIER = 1000;

/**
 * Determines if a version is a virtual patch format or not, using a very simplistic algorithm.
 */
export function isVirtualPatch(version: semver.SemVer | string): boolean {
	// If the major is 0 and the patch is >= 1000 assume it's a virtualPatch version
	if (
		semver.major(version) === 0 &&
		semver.patch(version) >= VIRTUAL_PATCH_FORMAT_MULTIPLIER
	) {
		return true;
	}
	return false;
}

/**
 * Increments the specified component of the provided version and returns the result.
 * @param versionBump - The bump type to do.
 * @param versionString - The version to bump.
 * @returns The bumped version.
 */
export function bumpVirtualPatchVersion(
	versionBump: VersionBumpType,
	versionString: semver.SemVer | string,
): semver.SemVer {
	const virtualVersion = semver.parse(versionString);
	if (!virtualVersion) {
		throw new Error("Unable to deconstruct package version for virtual patch");
	}
	if (virtualVersion.major !== 0) {
		throw new Error("Can only use virtual patches with major version 0");
	}

	switch (versionBump) {
		case "major": {
			virtualVersion.minor += 1;
			// the "minor" component starts at 1000 to work around issues padding to
			// 4 digits using 0s with semvers
			virtualVersion.patch = VIRTUAL_PATCH_FORMAT_MULTIPLIER;
			break;
		}
		case "minor": {
			virtualVersion.patch += VIRTUAL_PATCH_FORMAT_MULTIPLIER;
			// adjust down to the nearest thousand
			virtualVersion.patch =
				virtualVersion.patch - (virtualVersion.patch % VIRTUAL_PATCH_FORMAT_MULTIPLIER);
			break;
		}
		case "patch": {
			virtualVersion.patch += 1;
			break;
		}
		default: {
			throw new Error(`Unexpected version bump type: ${versionBump}`);
		}
	}

	virtualVersion.format(); // semver must be reformated after edits
	return virtualVersion;
}

/**
 * Translates a version using the Fluid virtualPatch version scheme into a standard semver.
 *
 * @param virtualPatchVersion - A Fluid virtualPatch version.
 * @returns The translated version.
 */
export function fromVirtualPatchScheme(
	virtualPatchVersion: semver.SemVer | string,
): semver.SemVer {
	const parsedVersion = semver.parse(virtualPatchVersion);
	assert(parsedVersion !== null, `Parsed as null: ${virtualPatchVersion}`);

	if (!isVirtualPatch(parsedVersion)) {
		throw new Error(`Version is not using the virtualPatch scheme: ${virtualPatchVersion}`);
	}

	const major = parsedVersion.minor;
	const minor =
		(parsedVersion.patch - (parsedVersion.patch % VIRTUAL_PATCH_FORMAT_MULTIPLIER)) /
		VIRTUAL_PATCH_FORMAT_MULTIPLIER;
	const patch = parsedVersion.patch % VIRTUAL_PATCH_FORMAT_MULTIPLIER;

	const convertedVersionString = `${major}.${minor}.${patch}`;
	const newSemVer = semver.parse(convertedVersionString);
	if (newSemVer === null) {
		throw new Error(`Couldn't convert ${convertedVersionString} to a standard semver.`);
	}

	return newSemVer;
}

/**
 * Translates a standard semver into the Fluid virtualPatch version scheme.
 *
 * @param virtualPatchVersion - A version.
 * @returns The translated virtualPatch version.
 */
export function toVirtualPatchScheme(version: semver.SemVer | string): semver.SemVer {
	const parsedVersion = semver.parse(version);
	assert(parsedVersion !== null, `Parsed as null: ${version}`);

	if (isVirtualPatch(parsedVersion)) {
		return parsedVersion;
	}

	if (parsedVersion === null) {
		throw new Error(`Couldn't parse ${version} as a semver.`);
	}

	const major = 0;
	const minor = parsedVersion.major;
	const patchBase = parsedVersion.minor === 0 ? 1 : parsedVersion.minor;
	const patch =
		patchBase * VIRTUAL_PATCH_FORMAT_MULTIPLIER +
		(parsedVersion.patch % VIRTUAL_PATCH_FORMAT_MULTIPLIER);

	const convertedVersionString = `${major}.${minor}.${patch}`;
	const newSemVer = semver.parse(convertedVersionString);
	if (newSemVer === null) {
		throw new Error(`Couldn't convert ${convertedVersionString} to a standard semver.`);
	}

	return newSemVer;
}
