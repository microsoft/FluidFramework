/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as semver from "semver";
import { VersionBumpTypeExtended } from "./bumpTypes";
import { bumpInternalVersion, getVersionRange } from "./internalVersionScheme";
import { adjustVersion, detectVersionScheme } from "./schemes";

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
export function incRange(
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
                    ? adjustVersion(originalNoPrerelease, bumpType, "virtualPatch")
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
