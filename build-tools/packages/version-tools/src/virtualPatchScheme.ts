/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import * as semver from "semver";
import { VersionBumpType } from "./bumpTypes";

/**
 * Determines if a version is a virtual patch format or not using a very simplistic algorithm.
 */
export function isVirtualPatch(version: semver.SemVer | string): boolean {
    // If the major is 0 and the patch is >= 1000 assume it's a virtualPatch version
    if (semver.major(version) === 0 && semver.patch(version) >= 1000) {
        return true;
    }
    return false;
}

/**
 * @param versionBump - The bump type to do.
 * @param versionString - The version to bump.
 * @returns The bumped version.
 */
export function bumpVirtualPatchVersion(
    versionBump: VersionBumpType,
    versionString: semver.SemVer | string,
): semver.SemVer {
    const virtualVersion = semver.parse(versionString);
    if (!virtualVersion) {
        throw new Error("Unable to deconstruct package version for virtual patch");
    }
    if (virtualVersion.major !== 0) {
        throw new Error("Can only use virtual patches with major version 0");
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
            throw new Error(`Unexpected version bump type: ${versionBump}`);
        }
    }

    virtualVersion.format(); // semver must be reformated after edits
    return virtualVersion;
}

/**
 * Translates a version using the Fluid virtualPatch version scheme into a standard semver.
 *
 * @param virtualPatchVersion - A Fluid virtualPatch version.
 * @returns The translated version.
 */
export function fromVirtualPatchScheme(virtualPatchVersion: semver.SemVer | string): semver.SemVer {
    const parsedVersion = semver.parse(virtualPatchVersion);
    assert(parsedVersion !== null);

    if (!isVirtualPatch(parsedVersion)) {
        throw new Error(`Version is not using the virtualPatch scheme: ${virtualPatchVersion}`);
    }

    const major = parsedVersion.minor;
    const minor = (parsedVersion.patch - (parsedVersion.patch % 1000)) / 1000;
    const patch = parsedVersion.patch % 1000;

    const convertedVersionString = `${major}.${minor}.${patch}`;
    const newSemVer = semver.parse(convertedVersionString);
    if (newSemVer === null) {
        throw new Error(`Couldn't convert ${convertedVersionString} to a standard semver.`);
    }

    return newSemVer;
}

/**
 * Translates a standard semver into the Fluid virtualPatch version scheme.
 *
 * @param virtualPatchVersion - A version.
 * @returns The translated virtualPatch version.
 */
export function toVirtualPatchScheme(version: semver.SemVer | string): semver.SemVer {
    const parsedVersion = semver.parse(version);
    assert(parsedVersion !== null);

    if (isVirtualPatch(parsedVersion)) {
        return parsedVersion;
    }

    if (parsedVersion === null) {
        throw new Error(`Couldn't parse ${version} as a semver.`);
    }

    const major = 0;
    const minor = parsedVersion.major;
    // (parsedVersion.patch - (parsedVersion.patch % 1000)) / 1000;
    const patchBase = parsedVersion.minor === 0 ? 1 : parsedVersion.minor;
    const patch = patchBase * 1000 + (parsedVersion.patch % 1000);

    const convertedVersionString = `${major}.${minor}.${patch}`;
    const newSemVer = semver.parse(convertedVersionString);
    if (newSemVer === null) {
        throw new Error(`Couldn't convert ${convertedVersionString} to a standard semver.`);
    }

    return newSemVer;
}
