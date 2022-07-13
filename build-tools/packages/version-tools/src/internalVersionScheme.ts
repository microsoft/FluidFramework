/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import * as semver from "semver";
import { VersionBumpType } from "@fluidframework/build-tools";

export const DEFAULT_PUBLIC_VERSION = "2.0.0";

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
 * @param internalVersion - a version in the Fluid internal version scheme.
 * @returns A tuple of [publicVersion, internalVersion]
 */
export function fromInternalScheme(
    internalVersion: semver.SemVer | string,
): [publicVersion: semver.SemVer, internalVersion: semver.SemVer] {
    const parsedVersion = semver.parse(internalVersion);
    validateVersionScheme(parsedVersion);

    assert(parsedVersion !== null);
    const newSemVerString = parsedVersion.prerelease.slice(1).join(".");
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

 * @param publicVersion - The public version.
 * @param version - The internal version.
 * @returns A version in the Fluid internal version scheme.
 */
export function toInternalScheme(
    publicVersion: semver.SemVer | string,
    version: semver.SemVer | string,
): semver.SemVer {
    const parsedVersion = semver.parse(version);
    if (parsedVersion === null) {
        throw new Error(`Couldn't parse ${version} as a semver.`);
    }

    if (parsedVersion.prerelease.length !== 0) {
        throw new Error(
            `Input version already has a pre-release component (${parsedVersion.prerelease}), which is not expected.`,
        );
    }

    const newSemVerString = `${publicVersion}-internal.${parsedVersion.major}.${parsedVersion.minor}.${parsedVersion.patch}`;
    const newSemVer = semver.parse(newSemVerString);
    if (newSemVer === null) {
        throw new Error(`Couldn't convert ${version} to the internal version scheme.`);
    }

    if (!isInternalVersionScheme(newSemVer)) {
        throw new Error(`Converted version is not a valid Fluid internal version: ${newSemVer}`);
    }

    return newSemVer;
}

/**
 * Validates that the version follows the Fluid internal version scheme. Throws if not.
 */
// eslint-disable-next-line @rushstack/no-new-null
function validateVersionScheme(version: semver.SemVer | string | null) {
    const parsedVersion = semver.parse(version);
    if (parsedVersion === null) {
        throw new Error(`Couldn't parse ${version} as a semver.`);
    }

    if (parsedVersion.prerelease.length !== 4) {
        throw new Error(
            `Prerelease value doesn't contain 4 components; found ${parsedVersion.prerelease.length}`,
        );
    }

    if (parsedVersion.prerelease[0] !== "internal") {
        throw new Error(
            `First prerelease component should be internal; found ${parsedVersion.prerelease[0]}`,
        );
    }

    if (parsedVersion.major < 2) {
        throw new Error(`The public major version must by >= 2; found ${parsedVersion.major}`);
    }
    return true;
}

/**
 * Checks if a version matches the Fluid internal version scheme.
 *
 * @param version - The version to check.
 * @returns True if the version matches the Fluid internal version scheme.
 */
export function isInternalVersionScheme(version: semver.SemVer | string): boolean {
    const parsedVersion = semver.parse(version);
    try {
        validateVersionScheme(parsedVersion);
    } catch (error) {
        return false;
    }

    return true;
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
    bumpType: VersionBumpType,
): semver.SemVer {
    validateVersionScheme(version);

    const [pubVer, intVer] = fromInternalScheme(version);
    const newIntVer = intVer.inc(bumpType);
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
