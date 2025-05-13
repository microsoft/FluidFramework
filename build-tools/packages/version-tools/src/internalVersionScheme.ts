/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import * as semver from "semver";

import { VersionBumpTypeExtended } from "./bumpTypes";
import { detectVersionScheme } from "./schemes";

/**
 * The lowest/default public version of valid Fluid internal versions. The public version of Fluid internal versions
 * should NEVER be lower than this value.
 */
export const MINIMUM_PUBLIC_VERSION = "2.0.0";

/**
 * The semver major version of the {@link MINIMUM_PUBLIC_VERSION}.
 */
const MINIMUM_PUBLIC_MAJOR = semver.major(MINIMUM_PUBLIC_VERSION);

/**
 * The expected number of prerelease sections a version should have to be considered a Fluid internal version. Any
 * version string with fewer than this number of prerelease sections is not a Fluid internal version.
 *
 * If a version has more than this number of prerelease sections, it may be considered a prerelease Fluid internal
 * version.
 */
const EXPECTED_PRERELEASE_SECTIONS = 4;

/**
 * The first part of the semver prerelease value is called the "prerelease identifier". For Fluid internal versions,
 * this is the default prerelease indentifier.
 */
export const DEFAULT_PRERELEASE_IDENTIFIER = "internal";

/**
 * Fluid RC releases use the "internal version scheme" with this prerelease identifier.
 */
export const RC_PRERELEASE_IDENTIFER = "rc";

/**
 * The first part of the semver prerelease value is called the "prerelease identifier". For Fluid internal versions, the
 * value must always match one of these values.
 */
export const ALLOWED_PRERELEASE_IDENTIFIERS = [
	DEFAULT_PRERELEASE_IDENTIFIER,
	RC_PRERELEASE_IDENTIFER,
] as const;

/**
 * Translates a version using the Fluid internal version scheme into two parts: the public version, and the internal
 * version, which is stored in the pre-release section of the version.
 *
 * @remarks
 *
 * The Fluid internal version scheme consists of two semver "triplets" of major/minor/patch. The first triplet is called
 * the "public version", and is stored in the standard semver positions in the version string.
 *
 * The second triplet is called the "internal version", and is found at the end of the pre-release section of the
 * version string.
 *
 * Fluid internal version strings *always* include the string "internal" in the first position of the pre-release
 * section.
 *
 * @example
 *
 * Public version `a.b.c` and internal version `x.y.z` yields `a.b.c-internal.x.y.z`.
 *
 * @param internalVersion - A version in the Fluid internal version scheme.
 * @param allowPrereleases - If true, allow prerelease Fluid internal versions.
 * @param allowAnyPrereleaseId - If true, allows any prerelease identifier string. When false, only allows
 * `ALLOWED_PRERELEASE_IDENTIFIERS`.
 *
 * @returns A tuple of [publicVersion, internalVersion, prereleaseIdentifier]
 */
export function fromInternalScheme(
	internalVersion: semver.SemVer | string,
	allowPrereleases = false,
	allowAnyPrereleaseId = false,
): [
	publicVersion: semver.SemVer,
	internalVersion: semver.SemVer,
	prereleaseIndentifier: string,
] {
	const parsedVersion = semver.parse(internalVersion);
	validateVersionScheme(
		parsedVersion,
		allowPrereleases,
		allowAnyPrereleaseId ? undefined : ALLOWED_PRERELEASE_IDENTIFIERS,
	);

	assert(parsedVersion !== null);
	const prereleaseSections = parsedVersion.prerelease;

	const prereleaseIdentifier = prereleaseSections[0];
	assert(typeof prereleaseIdentifier === "string");

	const newSemVerString =
		prereleaseSections.length > 4
			? `${prereleaseSections.slice(1, 4).join(".")}-${prereleaseSections.slice(4).join(".")}`
			: prereleaseSections.slice(1).join(".");
	const newSemVer = semver.parse(newSemVerString);
	if (newSemVer === null) {
		throw new Error(`Couldn't convert ${internalVersion} to a standard semver.`);
	}

	const publicVersionString = parsedVersion.format().split("-")[0];
	const publicVersion = semver.parse(publicVersionString);
	if (publicVersion === null) {
		throw new Error(`Couldn't convert ${publicVersionString} to a standard semver.`);
	}

	return [publicVersion, newSemVer, prereleaseIdentifier];
}

/**
 * Translates a version into the Fluid internal version scheme.
 *
 * @remarks
 *
 * The Fluid internal version scheme consists of two semver "triplets" of major/minor/patch. The first triplet is called
 * the "public version", and is stored in the standard semver positions in the version string.
 *
 * The second triplet is called the "internal version", and is found at the end of the pre-release section of the
 * version string.
 *
 * Fluid internal version strings *always* include the string "internal" in the first position of the pre-release
 * section.
 *
 * In the following example, the public version is `a.b.c`, while the internal version is `x.y.z`.
 *
 * @example
 *
 * Public version `a.b.c` and internal version `x.y.z` yields `a.b.c-internal.x.y.z`.
 *
 * @param publicVersion - The public version.
 * @param version - The internal version.
 * @param allowPrereleases - If true, allow prerelease Fluid internal versions.
 * @param prereleaseIdentifier - The prerelease indentifier to use in the Fluid internal version. Defaults to
 * `ALLOWED_PRERELEASE_IDENTIFIERS`.
 *
 * @returns A version in the Fluid internal version scheme.
 */
export function toInternalScheme(
	publicVersion: semver.SemVer | string,
	version: semver.SemVer | string,
	allowPrereleases = false,
	prereleaseIdentifier = DEFAULT_PRERELEASE_IDENTIFIER,
): semver.SemVer {
	const parsedVersion = semver.parse(version);
	if (parsedVersion === null) {
		throw new Error(`Couldn't parse ${version} as a semver.`);
	}

	if (!allowPrereleases && parsedVersion.prerelease.length > 0) {
		throw new Error(
			`Input version already has a pre-release component (${parsedVersion.prerelease}), which is not expected.`,
		);
	}

	const prereleaseSections = parsedVersion.prerelease;
	const newPrerelease =
		prereleaseSections.length > 0 ? `.${prereleaseSections.join(".")}` : "";
	const newSemVerString = `${publicVersion}-${prereleaseIdentifier}.${parsedVersion.major}.${parsedVersion.minor}.${parsedVersion.patch}${newPrerelease}`;
	const newSemVer = semver.parse(newSemVerString);
	if (newSemVer === null) {
		throw new Error(
			`Couldn't convert ${version} to the internal version scheme. Tried parsing: '${newSemVerString}'`,
		);
	}

	if (!isInternalVersionScheme(newSemVer, allowPrereleases, true)) {
		throw new Error(`Converted version is not a valid Fluid internal version: ${newSemVer}`);
	}

	return newSemVer;
}

/**
 * Validates that the version follows the Fluid internal version scheme.
 *
 * @param version - The version to check.
 * @param allowPrereleases - If true, allow prerelease Fluid internal versions.
 * @param prereleaseIdentifiers - If provided, the version must use one of these prereleaseIdentifier to be considered a
 * valid internal version. When set to undefined any prerelease identifier will be considered valid.
 * @returns True if the version matches the Fluid internal version scheme. Throws if not.
 *
 * @remarks
 *
 * This function is not typically used. {@link isInternalVersionScheme} is more useful since it does not throw.
 */
export function validateVersionScheme(
	// eslint-disable-next-line @rushstack/no-new-null
	version: semver.SemVer | string | null,
	allowPrereleases = false,
	prereleaseIdentifiers?: readonly string[],
): boolean {
	const parsedVersion = semver.parse(version);
	if (parsedVersion === null) {
		throw new Error(`Couldn't parse ${version} as a semver.`);
	}

	if (parsedVersion.prerelease.length === 0) {
		throw new Error(`No prerelease section in ${version}`);
	}

	if (typeof parsedVersion.prerelease[0] !== "string") {
		throw new TypeError(
			`Expected a string; found a ${typeof parsedVersion.prerelease[0]} instead: ${
				parsedVersion.prerelease[0]
			}`,
		);
	}

	if (prereleaseIdentifiers !== undefined) {
		// the "prerelease identifier" is the first section of the prerelease field
		const prereleaseId = parsedVersion.prerelease[0];
		if (!prereleaseIdentifiers.includes(prereleaseId)) {
			throw new Error(
				`First prerelease component should be one of '${prereleaseIdentifiers.join(
					", ",
				)}'; found ${prereleaseId}`,
			);
		}
	}

	if (parsedVersion.major < MINIMUM_PUBLIC_MAJOR) {
		throw new Error(
			`The public major version must be >= ${MINIMUM_PUBLIC_MAJOR}; found ${parsedVersion.major}`,
		);
	}

	if (
		// All versions with fewer than the min prerelease sections should not be considered internal
		parsedVersion.prerelease.length < EXPECTED_PRERELEASE_SECTIONS ||
		// If the version has more than the minimum prerelease sections, then it's not considered an internal version unless
		// allowPrereleases === true
		(parsedVersion.prerelease.length > EXPECTED_PRERELEASE_SECTIONS && !allowPrereleases)
	) {
		throw new Error(
			`Prerelease value contains ${parsedVersion.prerelease.length} components; expected ${EXPECTED_PRERELEASE_SECTIONS}.`,
		);
	}

	return true;
}

/**
 * Checks if a version matches the Fluid internal version scheme. By default, prerelease Fluid internal versions are
 * excluded.
 *
 * @param version - The version to check. If it is `undefined`, returns false.
 * @param allowPrereleases - If true, allow prerelease Fluid internal versions.
 * @param allowAnyPrereleaseId - If true, allows any prerelease identifier string. When false, only allows
 * `ALLOWED_PRERELEASE_IDENTIFIERS`.
 * @returns True if the version matches the Fluid internal version scheme.
 */
export function isInternalVersionScheme(
	version: semver.SemVer | string | undefined,
	allowPrereleases = false,
	allowAnyPrereleaseId = false,
): boolean {
	const parsedVersion = semver.parse(version);
	const prereleaseIds = allowAnyPrereleaseId ? undefined : ALLOWED_PRERELEASE_IDENTIFIERS;

	try {
		validateVersionScheme(parsedVersion, allowPrereleases, prereleaseIds);
	} catch {
		return false;
	}

	return true;
}

/**
 * Checks if a version matches the Fluid internal version scheme.
 *
 * @param range - The range string to check.
 * @param allowAnyPrereleaseId - If true, allows any prerelease identifier string. When false, only allows
 * `ALLOWED_PRERELEASE_IDENTIFIERS`.
 * @returns True if the range string matches the Fluid internal version scheme.
 */
export function isInternalVersionRange(range: string, allowAnyPrereleaseId = false): boolean {
	if (semver.validRange(range) === null) {
		return false;
	}

	const semverRange = new semver.Range(range);
	// If range is composed of multiple ranges (uses `||`), then
	if (semverRange.set.length > 1) {
		for (const rangeSet of semverRange.set) {
			if (!isInternalVersionRange(rangeSet.join(" "), allowAnyPrereleaseId)) {
				return false;
			}
		}
		return true;
	}

	// There is one set.
	const singleRangeSet = semverRange.set[0];

	// Prerelease ranges must have comparator operators. This definition expects at least one '>='.
	if (!singleRangeSet.some((comparator) => comparator.operator === ">=")) {
		return false;
	}

	const minVer = semver.minVersion(range);
	if (minVer === null) {
		return false;
	}

	// if allowAnyPrereleaseId === true, then allowPrereleases is implied to be true
	if (
		!isInternalVersionScheme(
			minVer,
			/* allowPrereleases */ allowAnyPrereleaseId,
			allowAnyPrereleaseId,
		)
	) {
		return false;
	}

	// For internal version, range should not exceed the scope of single internal version.
	// There should be a limit spec in range set (has '<' operator) with same prefix.
	const prereleasePrefix = `${minVer.major}.${minVer.minor}.${minVer.patch}-${minVer.prerelease[0]}.`;
	return singleRangeSet.some(
		(comparator) =>
			comparator.operator === "<" && comparator.semver.version.startsWith(prereleasePrefix),
	);
}

/**
 * Bumps the "internal version" of a version in the Fluid internal version scheme.
 *
 * @param version - The version to bump. The version must be in the Fluid internal version scheme or this function will
 * throw an error.
 * @param bumpType - The type of bump to apply.
 * @returns The bumped version.
 */
export function bumpInternalVersion(
	version: semver.SemVer | string,
	bumpType: VersionBumpTypeExtended,
): semver.SemVer {
	validateVersionScheme(version, true, undefined);
	const [pubVer, intVer, prereleaseId] = fromInternalScheme(version, true, true);

	const newIntVer =
		bumpType === "current"
			? intVer
			: semver.inc(`${intVer.major}.${intVer.minor}.${intVer.patch}`, bumpType);

	assert(newIntVer !== null, `newIntVer should not be null: ${version}`);

	return toInternalScheme(pubVer, newIntVer, true, prereleaseId);
}

/**
 * Returns a dependency range string for the Fluid internal version.
 *
 * @remarks
 *
 * The Fluid internal version scheme is not compatible with common dependency shorthands like ~ and ^. Instead, more
 * complex greater-than/less-than ranges must be used. This function simplifies generating those ranges.
 *
 * @param version - The Fluid internal version to use as the *minimum* for the version range. This version must be a
 * Fluid internal version or an Error will be thrown.
 * @param maxAutomaticBump - The maximum level of semver bumps you want the range to allow. For example, if you want the
 * dependency range to allow more recent patch versions, pass the value "patch". You can also pass "~" and "^" to
 * generate a range equivalent to those shorthands.
 * @returns A dependency range string. If the generated range is invalid an Error will be thrown.
 */
export function getVersionRange(
	version: semver.SemVer | string,
	maxAutomaticBump: "minor" | "patch" | "~" | "^",
): string {
	validateVersionScheme(version, true, undefined);

	const lowVersion = version;
	let highVersion: semver.SemVer;
	switch (maxAutomaticBump) {
		case "patch":
		case "~": {
			highVersion = bumpInternalVersion(version, "minor");
			break;
		}

		case "minor":
		case "^": {
			highVersion = bumpInternalVersion(version, "major");
			break;
		}

		default: {
			throw new Error("Can't generate a version range.");
		}
	}
	const rangeString = `>=${lowVersion} <${highVersion}`;
	const range = semver.validRange(rangeString);
	if (range === null) {
		throw new Error(`The generated range string was invalid: "${rangeString}"`);
	}
	return range;
}

/**
 * Given a version with a string prerelease indentifier, updates the version to use a new prerelease identifier.
 *
 * @param version - The version to update.
 * @param newIdentifier - The new prerelease identifier to set.
 * @returns The updated version string.
 */
export function changePreReleaseIdentifier(
	version: semver.SemVer | string,
	newIdentifier: string,
): string {
	const ver = semver.parse(version);

	if (ver === null) {
		throw new Error(`Can't parse version: ${version}`);
	}

	const pr = ver.prerelease;
	if (pr.length === 0) {
		throw new Error(`Version has no prerelease section: ${version}`);
	}

	const identifier = pr[0];

	if (typeof identifier === "number") {
		// eslint-disable-next-line unicorn/prefer-type-error
		throw new Error(`Prerelease identifier is numeric; it should be a string: ${version}`);
	}

	const newPrereleaseSection = [newIdentifier, ...pr.slice(1)].join(".");
	const newVersionString = `${ver.major}.${ver.minor}.${ver.patch}-${newPrereleaseSection}`;

	const newVer = semver.parse(newVersionString)?.version;

	if (newVer === null || newVer === undefined) {
		throw new Error(`Can't parse new version string: ${version}`);
	}

	return newVer;
}

/**
 * Detects the type of upgrade constraint that a version range represents. Only works for Fluid internal version scheme
 * versions.
 *
 * @param range - The range to check.
 * @returns The constraint type.
 *
 * @throws an Error if `range` is not a parseable semver.Range or if it's not a Fluid internal version scheme.
 *
 * @remarks
 *
 * This function is only needed for the \>= \< version ranges that Fluid internal versions require. It supports ranges
 * that start with ~ and ^ for convenience, but standard Fluid internal version ranges always use the \>= \< version
 * ranges.
 *
 * @internal
 */
export function detectInternalVersionConstraintType(
	range: string,
): "minor" | "patch" | "exact" {
	if (semver.validRange(range) === null) {
		throw new Error(`Invalid range: ${range}`);
	}

	const minVer = semver.minVersion(range);
	if (minVer === null) {
		throw new Error(`Couldn't determine minVersion from ${range}.`);
	}

	const scheme = detectVersionScheme(minVer);
	if (scheme !== "internal" && scheme !== "internalPrerelease") {
		throw new Error(`Range ${range} is not a Fluid internal version range.`);
	}

	// These cases are not expected to be positive; nor are robust.
	// internalPrerelease only applies to versions, which won't have ~ or ^.
	// internal ranges are restricted to uses of `>=` even though semver would permit more.
	// For prerelease spec (internal range), ~ and ^ are interpreted as >= by semver.
	// Why not just use the bump and checks all the time?
	if (range.startsWith("~")) {
		return "patch";
	} else if (range.startsWith("^")) {
		return "minor";
	}

	const patch = bumpInternalVersion(minVer, "patch");
	const minor = bumpInternalVersion(minVer, "minor");

	const maxSatisfying = semver.maxSatisfying([patch, minor], range);
	return maxSatisfying === patch ? "patch" : maxSatisfying === minor ? "minor" : "exact";
}

/**
 * Checks if the provided version is a test version.
 *
 * Test versions are generated from test/ branches and are published to the test feed.
 *
 * @param version - The version to check
 * @returns - True if the version string is a test version, otherwise false
 *
 * @example
 * returns true
 * isInternalTestVersion("0.0.0-260312-test");
 *
 * @example
 * returns false
 * isInternalTestVersion("2.1.0-260312");
 *
 * @throws error - If the version string cannot be parsed as a valid semantic version.
 */
export function isInternalTestVersion(version: semver.SemVer | string): boolean {
	const parsedVersion = semver.parse(version);

	if (parsedVersion === null) {
		throw new Error(`Couldn't parse ${version} as a semver.`);
	}

	if (
		parsedVersion.prerelease.length === 0 ||
		typeof parsedVersion.prerelease[0] !== "string"
	) {
		return false;
	}

	const isTestVersion =
		parsedVersion.minor === 0 &&
		parsedVersion.major === 0 &&
		parsedVersion.patch === 0 &&
		parsedVersion.prerelease[0].endsWith("-test");

	return isTestVersion;
}
