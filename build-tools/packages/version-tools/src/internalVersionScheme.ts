/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import * as semver from "semver";
import { VersionBumpTypeExtended } from "./bumpTypes";

/**
 * The lowest/default public version of valid Fluid internal versions. The public version of Fluid internal versions
 * should NEVER be lower than this value.
 */
export const MINIMUM_PUBLIC_VERSION = "2.0.0";

/** The semver major version of the {@link MINIMUM_PUBLIC_VERSION}. */
const MINIMUM_PUBLIC_MAJOR = semver.major(MINIMUM_PUBLIC_VERSION);

/** The minimum number of prerelease sections a version should have to be considered a Fluid internal version. */
const MINIMUM_SEMVER_PRERELEASE_SECTIONS = 4;

/**
 * The first part of the semver prerelease value is called the "prerelease identifier". For Fluid internal versions, the
 * value must always match this constant.
 */
const REQUIRED_PRERELEASE_IDENTIFIER = "internal";

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
 * In the following example, the public version is `a.b.c`, while the internal version is `x.y.z`.
 *
 * @example
 *
 * a.b.c-internal.x.y.z
 *
 * @param internalVersion - A version in the Fluid internal version scheme.
 * @param allowPrereleases - If true, allow prerelease Fluid internal versions.
 * @returns A tuple of [publicVersion, internalVersion]
 */
export function fromInternalScheme(
    internalVersion: semver.SemVer | string,
    allowPrereleases = false,
): [publicVersion: semver.SemVer, internalVersion: semver.SemVer] {
    const parsedVersion = semver.parse(internalVersion);
    validateVersionScheme(parsedVersion, allowPrereleases);

    assert(parsedVersion !== null);
    const prereleaseSections = parsedVersion.prerelease;

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

    return [publicVersion, newSemVer];
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
 * a.b.c-internal.x.y.z
 *
 * @param publicVersion - The public version.
 * @param version - The internal version.
 * @param allowPrereleases - If true, allow prerelease Fluid internal versions.
 * @returns A version in the Fluid internal version scheme.
 */
export function toInternalScheme(
    publicVersion: semver.SemVer | string,
    version: semver.SemVer | string,
    allowPrereleases = false,
): semver.SemVer {
    const parsedVersion = semver.parse(version);
    if (parsedVersion === null) {
        throw new Error(`Couldn't parse ${version} as a semver.`);
    }

    if (!allowPrereleases && parsedVersion.prerelease.length !== 0) {
        throw new Error(
            `Input version already has a pre-release component (${parsedVersion.prerelease}), which is not expected.`,
        );
    }

    const prereleaseSections = parsedVersion.prerelease;
    const newPrerelease = prereleaseSections.length > 0 ? `.${prereleaseSections.join(".")}` : "";
    const newSemVerString = `${publicVersion}-internal.${parsedVersion.major}.${parsedVersion.minor}.${parsedVersion.patch}${newPrerelease}`;
    const newSemVer = semver.parse(newSemVerString);
    if (newSemVer === null) {
        throw new Error(
            `Couldn't convert ${version} to the internal version scheme. Tried parsing: '${newSemVerString}'`,
        );
    }

    if (!isInternalVersionScheme(newSemVer, allowPrereleases)) {
        throw new Error(`Converted version is not a valid Fluid internal version: ${newSemVer}`);
    }

    return newSemVer;
}

/**
 * Validates that the version follows the Fluid internal version scheme.
 *
 * @param version - The version to check.
 * @param allowPrereleases - If true, allow prerelease Fluid internal versions.
 * @returns True if the version matches the Fluid internal version scheme. Throws if not.
 *
 * @remarks
 *
 * This function is not typically used. {@link isInternalVersionScheme} is more useful since it does not throw.
 */
// eslint-disable-next-line @rushstack/no-new-null
function validateVersionScheme(version: semver.SemVer | string | null, allowPrereleases = false) {
    const parsedVersion = semver.parse(version);
    if (parsedVersion === null) {
        throw new Error(`Couldn't parse ${version} as a semver.`);
    }

    // extract what semver calls the "prerelease identifier," which is the first section of the prerelease field.
    const prereleaseId = parsedVersion.prerelease[0];
    if (prereleaseId !== REQUIRED_PRERELEASE_IDENTIFIER) {
        throw new Error(
            `First prerelease component should be '${REQUIRED_PRERELEASE_IDENTIFIER}'; found ${prereleaseId}`,
        );
    }

    if (parsedVersion.major < MINIMUM_PUBLIC_MAJOR) {
        throw new Error(
            `The public major version must be >= ${MINIMUM_PUBLIC_MAJOR}; found ${parsedVersion.major}`,
        );
    }

    if (parsedVersion.prerelease.length > MINIMUM_SEMVER_PRERELEASE_SECTIONS) {
        if (allowPrereleases) {
            return true;
        }
        throw new Error(
            `Prerelease value contains ${parsedVersion.prerelease.length} components; expected ${MINIMUM_SEMVER_PRERELEASE_SECTIONS}.`,
        );
    }

    return true;
}

/**
 * Checks if a version matches the Fluid internal version scheme. By default, prerelease Fluid internal versions are
 * excluded.
 *
 * @param version - The version to check.
 * @param allowPrereleases - If true, allow prerelease Fluid internal versions.
 * @returns True if the version matches the Fluid internal version scheme.
 */
export function isInternalVersionScheme(
    version: semver.SemVer | string,
    allowPrereleases = false,
): boolean {
    const parsedVersion = semver.parse(version);
    try {
        validateVersionScheme(parsedVersion, allowPrereleases);
    } catch (error) {
        return false;
    }

    return true;
}

/**
 * Checks if a version matches the Fluid internal version scheme.
 *
 * @param range - The range string to check.
 * @returns True if the range string matches the Fluid internal version scheme.
 */
export function isInternalVersionRange(range: string): boolean {
    if (semver.validRange(range) === null) {
        return false;
    }

    if (!range.startsWith(">=")) {
        return false;
    }

    const minVer = semver.minVersion(range);
    if (minVer === null) {
        return false;
    }

    return isInternalVersionScheme(minVer);
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
    validateVersionScheme(version);
    const [pubVer, intVer] = fromInternalScheme(version);
    const newIntVer = bumpType === "current" ? intVer : intVer.inc(bumpType);
    return toInternalScheme(pubVer, newIntVer);
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
    validateVersionScheme(version);

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

export function changePreReleaseIdentifier(
    version: semver.SemVer | string,
    newIdentifier: string,
): string {
    const ver = semver.parse(version);

    if (ver === null) {
        throw new Error(`Can't parse version: ${version}`);
    }

    const pr = ver.prerelease;
    if (pr.length < 1) {
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
