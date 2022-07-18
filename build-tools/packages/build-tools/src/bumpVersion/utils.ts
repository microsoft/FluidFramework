/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { execAsync } from "../common/utils";
import * as semver from "semver";
import {
    VersionScheme,
    isVersionBumpType,
    VersionBumpType,
    VersionChangeType,
    VersionChangeTypeExtended,
} from "./versionSchemes";

export function fatal(error: string): never {
    const e = new Error(error);
    (e as any).fatal = true;
    throw e;
}

/**
 * Execute a command. If there is an error, print error message and exit process
 *
 * @param cmd Command line to execute
 * @param dir dir the directory to execute on
 * @param error description of command line to print when error happens
 */
export async function exec(cmd: string, dir: string, error: string, pipeStdIn?: string) {
    const result = await execAsync(cmd, { cwd: dir }, pipeStdIn);
    if (result.error) {
        fatal(`ERROR: Unable to ${error}\nERROR: error during command ${cmd}\nERROR: ${result.error.message}`);
    }
    return result.stdout;
}

/**
 * Execute a command. If there is an error, print error message and exit process
 *
 * @param cmd Command line to execute
 * @param dir dir the directory to execute on
 * @param error description of command line to print when error happens
 */
export async function execNoError(cmd: string, dir: string, pipeStdIn?: string) {
    const result = await execAsync(cmd, { cwd: dir }, pipeStdIn);
    if (result.error) {
        return undefined;
    }
    return result.stdout;
}

export function prereleaseSatisfies(packageVersion: string, range: string) {
    // Pretend that the current package is latest prerelease (zzz) and see if the version still satisfies.
    return semver.satisfies(`${packageVersion}-zzz`, range)
}

/**
 * Translate a {@link VersionChangeType} for the virtual patch scenario where we overload a beta version number
 * to include all of major, minor, and patch.  Actual semver type is not translated
 * "major" maps to "minor" with "patch" = 1000 (<N + 1>.0.0 -> 0.<N + 1>.1000)
 * "minor" maps to "patch" * 1000 (x.<N + 1>.0 -> 0.x.<N + 1>000)
 * "patch" is unchanged (but remember the final patch number holds "minor" * 1000 + the incrementing "patch")
 */
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
            break;
        }
        case "patch": {
            virtualVersion.patch += 1;
            break;
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
    scheme: VersionScheme): semver.SemVer {
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
                    fatal(`Applying virtual patch failed. The version returned was: ${translatedVersion}`);
                }
            } else {
                fatal("Can only use virtual patches when doing major/minor/patch bumps");
            }
        }
    }
}
