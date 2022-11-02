/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as semver from "semver";

import { ReleaseVersion, VersionBumpType, VersionBumpTypeExtended } from "./bumpTypes";
import {
    bumpInternalVersion,
    fromInternalScheme,
    getVersionRange,
    isInternalVersionScheme,
    toInternalScheme,
} from "./internalVersionScheme";
import { bumpVersionScheme, detectVersionScheme } from "./schemes";
import { fromVirtualPatchScheme, toVirtualPatchScheme } from "./virtualPatchScheme";

/**
 * Return the version RANGE incremented by the bump type (major, minor, or patch).
 *
 * @remarks
 *
 * Only simple "^" and "~" ranges and Fluid internal version scheme ranges are supported.
 *
 * @param range - A dependency range string to increment.
 * @param bumpType - The type of bump.
 * @param prerelease - If true, will bump to a prerelease version.
 * @returns a bumped range string.
 */
export function bumpRange(
    range: string,
    bumpType: VersionBumpTypeExtended,
    prerelease = false,
): string {
    if (semver.validRange(range) === null) {
        throw new Error(`${range} is not a valid semver range.`);
    }

    const scheme = detectVersionScheme(range);
    switch (scheme) {
        case "virtualPatch":
        case "semver": {
            const operator = range.slice(0, 1);
            const isPreciseVersion = operator !== "^" && operator !== "~";
            const original = isPreciseVersion ? range : range.slice(1);
            const parsedVersion = semver.parse(original);
            const originalNoPrerelease = `${parsedVersion?.major}.${parsedVersion?.minor}.${parsedVersion?.patch}`;
            const newVersion =
                bumpType === "current"
                    ? originalNoPrerelease
                    : scheme === "virtualPatch"
                    ? bumpVersionScheme(originalNoPrerelease, bumpType, "virtualPatch")
                    : semver.inc(originalNoPrerelease, bumpType);
            if (newVersion === null) {
                throw new Error(`Failed to increment ${original}.`);
            }
            return `${isPreciseVersion ? "" : operator}${newVersion}${prerelease ? "-0" : ""}`;
        }

        case "internal": {
            const constraintType = detectConstraintType(range);
            const original = semver.minVersion(range);
            if (original === null) {
                throw new Error(`Couldn't determine minVersion from ${range}.`);
            }
            const newVersion = bumpInternalVersion(original, bumpType);
            return getVersionRange(newVersion, constraintType);
        }

        default: {
            throw new Error(`${scheme} wasn't handled. Was a new version scheme added?`);
        }
    }
}

/**
 * Detects the type of upgrade constraint that a version range represents. Only works for Fluid internal version scheme
 * versions.
 *
 * @param range - The range to check.
 * @returns The constraint type.
 *
 * @remarks
 *
 * Throws an Error if the range is not valid.
 */
export function detectConstraintType(range: string): "minor" | "patch" {
    const minVer = semver.minVersion(range);
    if (minVer === null) {
        throw new Error(`Couldn't determine minVersion from ${range}.`);
    }

    const patch = bumpInternalVersion(minVer, "patch");
    const minor = bumpInternalVersion(minVer, "minor");

    const maxSatisfying = semver.maxSatisfying([patch, minor], range);
    return maxSatisfying === patch ? "patch" : "minor";
}

/**
 * Given a first and second version, returns the bump type. Works correctly for Fluid internal versions.
 *
 * @param v1 - The first version to compare.
 * @param v2 - The second version to compare.
 * @returns The bump type, or undefined if it can't be determined.
 */
export function detectBumpType(
    // eslint-disable-next-line @rushstack/no-new-null
    v1: semver.SemVer | string | null,
    // eslint-disable-next-line @rushstack/no-new-null
    v2: semver.SemVer | string | null,
): VersionBumpType | undefined {
    let v1Parsed = semver.parse(v1);
    if (v1Parsed === null || v1 === null) {
        throw new Error(`Invalid version: ${v1}`);
    }

    let v2Parsed = semver.parse(v2);
    if (v2Parsed === null || v2 === null) {
        throw new Error(`Invalid version: ${v2}`);
    }

    const v1IsInternal = isInternalVersionScheme(v1, true, true);
    const v2IsInternal = isInternalVersionScheme(v2, true, true);

    if (v1IsInternal) {
        const [, internalVer] = fromInternalScheme(v1, true);
        v1Parsed = internalVer;
    }

    // Only convert if the versions are the same scheme.
    if (v2IsInternal && v1IsInternal) {
        const [, internalVer] = fromInternalScheme(v2, true);
        v2Parsed = internalVer;
    }

    if (semver.compareBuild(v1Parsed, v2Parsed) >= 0) {
        throw new Error(`v1: ${v1} is greater than v2: ${v2}`);
    }

    const bumpType = semver.diff(v1Parsed, v2Parsed);
    switch (bumpType) {
        case "major":
        case "premajor": {
            return "major";
        }

        case "minor":
        case "preminor": {
            return "minor";
        }

        case "patch":
        case "prepatch": {
            return "patch";
        }

        default: {
            return undefined;
        }
    }
}

/**
 * Checks if a version is prerelease or not, taking into account the Fluid internal version scheme.
 *
 * @param version - The version to check.
 * @returns True if the version is a prerelease version, false otherwise.
 */
export function isPrereleaseVersion(version: string | semver.SemVer | undefined): boolean {
    if (version === undefined) {
        return false;
    }

    const scheme = detectVersionScheme(version);

    // Fluid internal versions need special handling
    if (scheme === "internalPrerelease") {
        return true;
    } else if (scheme === "internal") {
        return false;
    }

    // All other schemes can use the semver library
    const prerelease = semver.prerelease(version);
    if (semver.parse(version) === null) {
        throw new Error(`Cannot parse version: ${version}`);
    }

    return prerelease !== null && prerelease.length > 0;
}

/**
 * Calculates and returns the previous major and minor versions for the provided version, taking into account the Fluid
 * internal and virtualPatch version schemes.
 *
 * @param version - The version to calculate previous versions for.
 * @returns A tuple of previous major version and previous minor version.
 *
 * @remarks
 *
 * This function does not consult any external sources to determine what versions are available. In other words, it
 * calculates the versions based on the input only. For this reason, the previous minor version does not "roll back" to
 * an earlier version series. In other words, for version 2.0.0, the previous minor version will be 2.0.0, while for
 * 2.1.0, the previous minor version will also be 2.0.0. In both cases, the previous major version will be 1.0.0.
 *
 * @throws
 *
 * This function will throw under any of the the following conditions:
 *
 * - For Fluid internal versions, the major version of the input is === 0.
 *
 * - For virtualPatch versions, the major version is \<= 1.
 *
 * - For semver versions, the version fails to parse.
 */
export function getPreviousVersions(
    version: ReleaseVersion,
): [ReleaseVersion | undefined, ReleaseVersion | undefined] {
    const scheme = detectVersionScheme(version);
    let previousMajorVersion: ReleaseVersion | undefined;
    let previousMinorVersion: ReleaseVersion | undefined;

    if (scheme === "internal") {
        const [pubVer, intVer] = fromInternalScheme(version);
        if (intVer.major === 0) {
            throw new Error(`Internal major unexpectedly 0.`);
        }

        previousMajorVersion =
            intVer.major === 1
                ? "1.0.0"
                : toInternalScheme(pubVer, `${intVer.major - 1}.0.0`).version;

        previousMinorVersion =
            intVer.minor === 0
                ? toInternalScheme(pubVer, `${intVer.major}.${Math.max(0, intVer.minor - 1)}.0`)
                      .version
                : toInternalScheme(pubVer, `${intVer.major}.${Math.max(0, intVer.minor - 1)}.0`)
                      .version;
    } else if (scheme === "virtualPatch") {
        const ver = fromVirtualPatchScheme(version);
        if (ver.major <= 1) {
            throw new Error(`Virtual patch major unexpectedly <= 1.`);
        }
        previousMajorVersion = toVirtualPatchScheme(`${ver.major - 1}.0.0`).version;
        previousMinorVersion = toVirtualPatchScheme(
            `${ver.major}.${Math.max(0, ver.minor - 1)}.0`,
        ).version;
    } else {
        const ver = semver.parse(version);
        if (ver === null) {
            throw new Error(`Couldn't parse version string: ${version}`);
        }

        previousMajorVersion = ver.major <= 1 ? undefined : `${ver.major - 1}.0.0`;
        previousMinorVersion =
            ver.minor === 0 && ver.major === 0
                ? undefined
                : `${ver.major}.${Math.max(0, ver.minor - 1)}.0`;
    }

    return [previousMajorVersion, previousMinorVersion];
}
