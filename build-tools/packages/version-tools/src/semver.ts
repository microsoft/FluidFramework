/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as semver from "semver";
import { VersionBumpType } from "@fluidframework/build-tools";
import { bumpInternalVersion, getVersionRange } from "./internalVersionScheme";
import { detectVersionScheme } from "./schemes";

/**
 * Return the version RANGE incremented by the bump type (major, minor, or patch).
 *
 * @remarks
 *
 * Only simple "^" and "~" ranges and Fluid internal version scheme ranges are supported.
 *
 * @param range - A dependency range string to increment.
 * @param bumpType - The type of bump.
 * @returns a bumped range string.
 */
export function incRange(range: string, bumpType: VersionBumpType): string {
    if(semver.validRange(range) === null) {
        throw new Error(`${range} is not a valid semver range.`);
    }

    switch(detectVersionScheme(range)) {
        default:
        case "virtualPatch":
        case "semver": {
            const operator = range.slice(0,1);
            const original = range.slice(1);
            const newVersion = semver.inc(original, bumpType);
            if(newVersion === null) {
                throw new Error(`Failed to increment ${original}.`);
            }
            return `${operator}${newVersion}`;
        }

        case "internal": {
            let bumpTypeToApply = bumpType;
            if(bumpType === "major") {
                console.warn(
                    `WARNING: Can't do a major bump on the internal version scheme. Treating as a minor bump.`
                );
                bumpTypeToApply = "minor";
            }
            const constraintType = detectConstraintType(range);
            const original = semver.minVersion(range);
            if(original === null) {
                throw new Error(`Couldn't determine minVersion from ${range}.`);
            }
            const newVersion = bumpInternalVersion(original, bumpTypeToApply);
            return getVersionRange(newVersion, constraintType);
        }
    }
}

export function detectConstraintType(range: string): "minor" | "patch" {
    const minVer = semver.minVersion(range);
    if(minVer === null) {
        throw new Error(`Couldn't determine minVersion from ${range}.`);
    }

    const patch = bumpInternalVersion(minVer, "patch");
    const minor = bumpInternalVersion(minVer, "minor");

    const maxSatisfying = semver.maxSatisfying([patch, minor], range);
    return maxSatisfying === patch ? "patch" : "minor";
}
