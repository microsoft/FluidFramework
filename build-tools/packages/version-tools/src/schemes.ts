/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import * as semver from "semver";
import { isVersionBumpType, VersionBumpTypeExtended } from "./bumpTypes";
import {
    bumpInternalVersion,
    isInternalVersionRange,
    isInternalVersionScheme,
} from "./internalVersionScheme";
import { isVirtualPatch, bumpVirtualPatchVersion } from "./virtualPatchScheme";

/**
 * A type defining the version schemes that can be used for packages.
 *
 * - "semver" is the standard semver scheme.
 *
 * - "internal" is the 2.0.0-internal.1.0.0 scheme.
 *
 * - "virtualPatch" is the 0.36.1002 scheme.
 */
export type VersionScheme = "semver" | "internal" | "virtualPatch";

/**
 * A typeguard to check if a string is a {@link VersionScheme}.
 */
export function isVersionScheme(scheme: string | undefined): scheme is VersionScheme {
    return scheme === "semver" || scheme === "internal" || scheme === "virtualPatch";
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
    scheme: VersionScheme,
): semver.SemVer {
    const sv = semver.parse(version);
    assert(sv !== null, `Not a valid semver: ${version}`);
    switch (scheme) {
        case "semver": {
            switch (bumpType) {
                case "current":
                    return sv;
                case "major":
                case "minor":
                case "patch":
                    return sv?.inc(bumpType) ?? null;
                default:
                    // If the bump type is an explicit version, just use it.
                    return bumpType;
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
                if (!isVersionBumpType(translatedVersion)) {
                    return translatedVersion;
                } else {
                    throw new Error(
                        `Applying virtual patch failed. The version returned was: ${translatedVersion}`,
                    );
                }
            } else {
                return sv;
            }
        }
        default: {
            throw new Error(`Unexpected version scheme: ${scheme}`);
        }
    }
}
