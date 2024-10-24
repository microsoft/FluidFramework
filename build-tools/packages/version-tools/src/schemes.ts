/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import * as semver from "semver";

import { VersionBumpTypeExtended, isVersionBumpType } from "./bumpTypes";
import {
	bumpInternalVersion,
	isInternalVersionRange,
	isInternalVersionScheme,
} from "./internalVersionScheme";
import { bumpVirtualPatchVersion, isVirtualPatch } from "./virtualPatchScheme";

/**
 * A type defining the version schemes that can be used for packages.
 *
 * - "semver" is the standard semver scheme.
 *
 * - "internal" is the 2.0.0-internal.1.0.0 scheme.
 *
 * - "internalPrerelease" is the 2.0.0-dev.1.0.0.[CI build #] scheme.
 *
 * - "virtualPatch" is the 0.36.1002 scheme.
 */
export type VersionScheme = "semver" | "internal" | "internalPrerelease" | "virtualPatch";

/**
 * A typeguard to check if a string is a {@link VersionScheme}.
 */
export function isVersionScheme(scheme: string): scheme is VersionScheme {
	return (
		scheme === "semver" ||
		scheme === "internal" ||
		scheme === "internalPrerelease" ||
		scheme === "virtualPatch"
	);
}

/**
 * Given a version or a range string, determines what version scheme the string is using.
 * @param rangeOrVersion - a version or range string.
 * @returns The version scheme that the string is in.
 */
export function detectVersionScheme(rangeOrVersion: string | semver.SemVer): VersionScheme {
	// First check if the string is a valid internal version
	if (isInternalVersionScheme(rangeOrVersion)) {
		return "internal";
	}

	if (isInternalVersionScheme(rangeOrVersion, true, true)) {
		return "internalPrerelease";
	}

	if (semver.valid(rangeOrVersion) !== null) {
		// Must be a version string
		if (isVirtualPatch(rangeOrVersion)) {
			return "virtualPatch";
		}

		return "semver";
	} else if (
		typeof rangeOrVersion === "string" &&
		semver.validRange(rangeOrVersion) !== null
	) {
		// Must be a range string
		if (isInternalVersionRange(rangeOrVersion)) {
			return "internal";
		}

		const coercedVersion = semver.coerce(rangeOrVersion);
		if (coercedVersion === null) {
			throw new Error(`Couldn't parse a usable version from '${rangeOrVersion}'.`);
		}

		const operator = rangeOrVersion.slice(0, 1);
		if (operator === "^" || operator === "~") {
			if (isVirtualPatch(coercedVersion)) {
				return "virtualPatch";
			}
		} else {
			if (isVirtualPatch(rangeOrVersion)) {
				return "virtualPatch";
			}
		}
	}
	return "semver";
}

/**
 * Bumps the provided version according to the bump type and version scheme. Returns the bumped version.
 *
 * @param version - The input version.
 * @param bumpType - The type of bump.
 * @param scheme - The version scheme to use.
 * @returns An adjusted version as a semver.SemVer.
 */
export function bumpVersionScheme(
	version: string | semver.SemVer | undefined,
	bumpType: VersionBumpTypeExtended,
	scheme?: VersionScheme,
): semver.SemVer {
	const sv = semver.parse(version);
	assert(sv !== null && version !== undefined, `Not a valid semver: ${version}`);
	if (scheme === undefined) {
		// eslint-disable-next-line no-param-reassign
		scheme = detectVersionScheme(version);
	}
	switch (scheme) {
		case "semver": {
			switch (bumpType) {
				case "current": {
					return sv;
				}
				case "major":
				case "minor":
				case "patch": {
					// eslint-disable-next-line unicorn/no-null
					return sv?.inc(bumpType) ?? null;
				}
				default: {
					// If the bump type is an explicit version, just use it.
					return bumpType;
				}
			}
		}
		case "internal": {
			if (version === undefined || !isInternalVersionScheme(version)) {
				throw new Error(`Version is not in the ${scheme} version scheme: ${version}`);
			}
			return bumpInternalVersion(version, bumpType);
		}
		case "virtualPatch": {
			if (isVersionBumpType(bumpType)) {
				const translatedVersion = bumpVirtualPatchVersion(bumpType, sv);
				if (isVersionBumpType(translatedVersion)) {
					throw new Error(
						`Applying virtual patch failed. The version returned was: ${translatedVersion}`,
					);
				}
				return translatedVersion;
			} else {
				return sv;
			}
		}
		default: {
			throw new Error(`Unexpected version scheme: ${scheme}`);
		}
	}
}

/**
 * Finds the highest version number in a list of versions, accounting for the Fluid internal version scheme.
 *
 * @param versionList - The array of versions to search.
 * @param allowPrereleases - If true, prerelease versions will be included. Otherwise they will be filtered out, meaning
 * only released versions will be returned.
 * @returns The highest version number in the list.
 */
export function getLatestReleaseFromList(
	versionList: string[],
	allowPrereleases = false,
): string {
	const list = sortVersions(versionList, allowPrereleases);
	const latest = list[0];

	return latest;
}

export function sortVersions(versionList: string[], allowPrereleases = false): string[] {
	let list: string[] = [];

	// Check if the versionList is version strings or tag names
	const isTagNames = versionList.some((v) => v.includes("_v"));
	const versionsToIterate = isTagNames
		? versionList
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				.map((t) => getVersionFromTag(t)!)
				.filter((t) => t !== undefined && t !== "" && t !== null)
		: versionList;

	// Remove pre-releases from the list
	if (!allowPrereleases) {
		list = versionsToIterate.filter((v) => {
			if (v === undefined) {
				return false;
			}
			const hasSemverPrereleaseSection = semver.prerelease(v)?.length ?? 0 !== 0;
			const scheme = detectVersionScheme(v);
			const isPrerelease =
				scheme === "internalPrerelease" ||
				(hasSemverPrereleaseSection && scheme !== "internal");
			return !isPrerelease;
		});
	}

	list = semver.sort(list).reverse();
	return list;
}

/**
 * Parses a version from a git tag.
 * @param tag - The tag.
 * @returns A version parsed from the tag.
 *
 * TODO: Need up reconcile slightly different version in build-cli/src/library/context.ts
 */
function getVersionFromTag(tag: string): string | undefined {
	const tagSplit = tag.split("_v");
	if (tagSplit.length !== 2) {
		return undefined;
	}

	return tagSplit[1];
}
