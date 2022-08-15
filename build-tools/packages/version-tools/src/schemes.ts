/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import * as semver from "semver";
import {
    isVersionBumpType,
    VersionBumpType,
    VersionChangeType,
    VersionChangeTypeExtended,
} from "./bumpTypes";
import { isInternalVersionRange, isInternalVersionScheme } from "./internalVersionScheme";

/**
 * A type defining the version schemes that can be used for packages.
 *
 * - "semver" is the standard semver scheme.
 *
 * - "internal" is the 2.0.0-internal.1.0.0 scheme.
 *
 * - "internalPrerelease" is the 2.0.0-internal.1.0.0.[CI build #] scheme.
 *
 * - "virtualPatch" is the 0.36.1002 scheme.
 */
export type VersionScheme = "semver" | "internal" | "internalPrerelease" | "virtualPatch";

/**
 * A typeguard to check if a string is a {@link VersionScheme}.
 */
export function isVersionScheme(scheme: string): scheme is VersionScheme {
    return (
        scheme === "semver" ||
        scheme === "internal" ||
        scheme === "internalPrerelease" ||
        scheme === "virtualPatch"
    );
}

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
export function detectVersionScheme(rangeOrVersion: string | semver.SemVer): VersionScheme {
    // First check if the string is a valid internal version. We need to check this
    if (isInternalVersionScheme(rangeOrVersion)) {
        return "internal";
    }

    if (isInternalVersionScheme(rangeOrVersion, true)) {
        return "internalPrerelease";
    }

    if (semver.valid(rangeOrVersion) !== null) {
        // Must be a version string
        if (isVirtualPatch(rangeOrVersion)) {
            return "virtualPatch";
        }

        return "semver";
    } else if (typeof rangeOrVersion === "string" && semver.validRange(rangeOrVersion) !== null) {
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

function fatal(error: string): never {
    const e = new Error(error);
    (e as any).fatal = true;
    throw e;
}

/* eslint-disable tsdoc/syntax */
/**
 * Translate a {@link VersionChangeType} for the virtual patch scenario where we overload a beta version number
 * to include all of major, minor, and patch.  Actual semver type is not translated
 * "major" maps to "minor" with "patch" = 1000 (<N + 1>.0.0 -> 0.<N + 1>.1000)
 * "minor" maps to "patch" * 1000 (x.<N + 1>.0 -> 0.x.<N + 1>000)
 * "patch" is unchanged (but remember the final patch number holds "minor" * 1000 + the incrementing "patch")
 */
/* eslint-enable tsdoc/syntax */
function translateVirtualVersion(
    versionBump: VersionChangeType,
    versionString: string,
    virtualPatch: boolean,
): semver.SemVer | VersionBumpType {
    if (!virtualPatch) {
        return versionBump;
    }

    // Virtual patch can only be used for a major/minor/patch bump and not a specific version
    if (!isVersionBumpType(versionBump)) {
        fatal("Can only use virtual patches when doing major/minor/patch bumps");
    }

    const virtualVersion = semver.parse(versionString);
    if (!virtualVersion) {
        fatal("unable to deconstruct package version for virtual patch");
    }
    if (virtualVersion.major !== 0) {
        fatal("Can only use virtual patches with major version 0");
    }

    switch (versionBump) {
        case "major": {
            virtualVersion.minor += 1;
            // the "minor" component starts at 1000 to work around issues padding to
            // 4 digits using 0s with semvers
            virtualVersion.patch = 1000;
            break;
        }
        case "minor": {
            virtualVersion.patch += 1000;
            // adjust down to the nearest thousand
            virtualVersion.patch = virtualVersion.patch - (virtualVersion.patch % 1000);
            break;
        }
        case "patch": {
            virtualVersion.patch += 1;
            break;
        }
        default: {
            fatal(`Unexpected version bump type: ${versionBump}`);
        }
    }

    virtualVersion.format(); // semver must be reformated after edits
    return virtualVersion;
}

/**
 * Adjusts the provided version according to the bump type and version scheme. Returns the adjusted version.
 *
 * @param version - The input version.
 * @param bumpType - The type of bump.
 * @param scheme - The version scheme to use.
 * @returns An adjusted version as a semver.SemVer.
 */
export function adjustVersion(
    version: string | semver.SemVer | undefined,
    bumpType: VersionChangeTypeExtended,
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
            fatal("Not yet implemented");
            break;
        }
        case "virtualPatch": {
            if (isVersionBumpType(bumpType)) {
                const translatedVersion = translateVirtualVersion(bumpType, sv.version, true);
                if (!isVersionBumpType(translatedVersion)) {
                    return translatedVersion;
                } else {
                    fatal(
                        `Applying virtual patch failed. The version returned was: ${translatedVersion}`,
                    );
                }
            } else {
                return sv;
            }
        }
        default: {
            fatal(`Unexpected version scheme: ${scheme}`);
        }
    }
}

/**
 * Finds the highest version number in a list of versions, accounting for the Fluid internal version scheme.
 *
 * @param versionList - The array of versions to search.
 * @param allowPrereleases - If true, prerelease versions will be included. Otherwise they will be filtered out, meaning
 * only released versions will be returned.
 * @returns The highest version number in the list.
 */
export function getLatestReleaseFromList(versionList: string[], allowPrereleases = false) {
    let list: string[] = [];

    // Remove pre-releases from the list
    if (!allowPrereleases) {
        list = versionList.filter((v) => {
            const hasSemverPrereleaseSection = semver.prerelease(v)?.length ?? 0 !== 0;
            const scheme = detectVersionScheme(v);
            const isPrerelease =
                scheme === "internalPrerelease" ||
                (hasSemverPrereleaseSection && scheme !== "internal");
            return !isPrerelease;
        });
    }

    list = semver.sort(list);
    const latest = list[list.length - 1];

    return latest;
}
