/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as semver from "semver";

/**
 * A typeguard to check if a string is in the test version format.
 */
export function isTestVersion(version: string | semver.SemVer): boolean {
    const parsedVersion = semver.parse(version);

    try {
        validateTestVersion(parsedVersion);
    } catch (error) {
        return false;
    }
    return true;
}

// eslint-disable-next-line @rushstack/no-new-null
export function validateTestVersion(version: semver.SemVer | string | null): void {
    const parsedVersion = semver.parse(version);
    if (parsedVersion === null) {
        throw new Error(`Couldn't parse ${version} as a semver.`);
    }

    const mainVer = `${parsedVersion.major}.${parsedVersion.minor}.${parsedVersion.patch}`;
    if(mainVer !== "0.0.0") {
        throw new Error(`Expected 0.0.0; saw ${mainVer}`);
    }

    if(parsedVersion.prerelease.length === 0) {
        throw new Error(`No prerelease section in ${version}`);
    }

    if(!parsedVersion.version.endsWith("-test")) {
        throw new Error(`Version doesn't end in -test: ${version}`);
    }
}



