/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as semver from "semver";
import { VersionBumpTypeExtended, VersionBumpType } from "./bumpTypes";
import { bumpInternalVersion, getVersionRange } from "./internalVersionScheme";
import { bumpVersionScheme, detectVersionScheme } from "./schemes";

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
 * Given a first and second version, returns the bump type
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
    const v1Parsed = semver.parse(v1);
    if (v1Parsed === null) {
        throw new Error(`Invalid version: ${v1}`);
    }

    const v2Parsed = semver.parse(v2);
    if (v2Parsed === null) {
        throw new Error(`Invalid version: ${v2}`);
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
