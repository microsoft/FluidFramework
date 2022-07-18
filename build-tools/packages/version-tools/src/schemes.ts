/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as semver from "semver";
import { VersionScheme } from "@fluidframework/build-tools";
import { isInternalVersionScheme } from "./internalVersionScheme";

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
        // console.log(`Must be a version string`);
        // Must be a version string

        // If the major is less than 0 assume it's a virtualPatch version
        if (semver.major(rangeOrVersion) === 0) {
            return "virtualPatch";
        }

        return "semver";
    } else if (semver.validRange(rangeOrVersion) !== null) {
        // console.log(`Must be a range string`);
        // Must be a range string
        if (rangeOrVersion.startsWith(">=")) {
            return "internal";
        }

        const coercedVersion = semver.coerce(rangeOrVersion);
        // console.log(`coerced version: ${coercedVersion}`);
        if (coercedVersion === null) {
            throw new Error(`Couldn't parse a usable version from '${rangeOrVersion}'.`);
        }

        const operator = rangeOrVersion.slice(0, 1);
        if (operator === "^" || operator === "~") {
            if (semver.major(coercedVersion) === 0) {
                return "virtualPatch";
            }
        }
    }
    return "semver";
}
