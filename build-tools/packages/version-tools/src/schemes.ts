/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as semver from "semver";
import { VersionScheme } from "@fluidframework/build-tools";
import { isInternalVersionRange, isInternalVersionScheme } from "./internalVersionScheme";

/**
 * Determines if a version is a virtual patch format or not using a very simplistic algorithm.
 */
function isVirtualPatch(version: semver.SemVer | string): boolean {
    // If the major is 0 and the patch is >= 1000 assume it's a virtualPatch version
    if (semver.major(version) === 0 && semver.patch(version) >= 1000) {
        return true;
    }
    return false;
}

/**
 * Given a version or a range string, determines what version scheme the string is using.
 * @param rangeOrVersion - a version or range string.
 * @returns The version scheme that the string is in.
 */
export function detectVersionScheme(rangeOrVersion: string): VersionScheme {
    // First check if the string is a valid internal version
    if (isInternalVersionScheme(rangeOrVersion)) {
        return "internal";
    }

    if (semver.valid(rangeOrVersion) !== null) {
        // Must be a version string
        if (isVirtualPatch(rangeOrVersion)) {
            return "virtualPatch";
        }

        return "semver";
    } else if (semver.validRange(rangeOrVersion) !== null) {
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
