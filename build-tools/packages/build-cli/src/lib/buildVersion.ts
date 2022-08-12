/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable camelcase,no-process-exit,unicorn/no-process-exit */

/**
 * This script is used by the build server to compute the version number of the packages.
 * The release version number is based on what's in the lerna.json/package.json.
 * The CI will supply the build number and branch to determine the prerelease suffix if it is not a tagged build
 *
 * Input:
 *      ./lerna.json or ./package.json - base version number to use
 *      env:VERSION_BUILDNUMBER        - monotonically increasing build number from the CI
 *      env:VERSION_RELEASE            - whether this is a release build or not
 *      env:VERSION_PATCH              - Put the build number in the patch
 * Output:
 *      The computed version output to the console.
 */

import { sort as sort_semver, gte as gte_semver, prerelease as prerelease_semver } from "semver";
import { Logger } from "@fluidframework/build-tools";
import {
    detectVersionScheme,
    getLatestReleaseFromList,
    isInternalVersionScheme,
    getVersionFromTag,
} from "@fluid-tools/version-tools";

function parseFileVersion(file_version: string, build_id?: number) {
    const split = file_version.split("-");
    let release_version = split[0];
    split.shift();
    const prerelease_version = split.join("-");

    /**
     * Use the build id for patch number if given
     */
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (build_id) {
        // split the prerelease out
        const r = release_version.split(".");
        if (r.length !== 3) {
            console.error(`ERROR: Invalid format for release version ${release_version}`);
            process.exit(9);
        }

        // eslint-disable-next-line unicorn/prefer-number-properties, radix
        r[2] = (parseInt(r[2]) + build_id).toString();
        release_version = r.join(".");
    }

    return { release_version, prerelease_version };
}

/**
 * Compute the build suffix
 */
function getBuildSuffix(arg_release: boolean, build_num: string) {
    return arg_release ? "" : build_num;
}

/* A simpler CI version that append the build number at the end in the prerelease */
function generateSimpleVersion(
    release_version: string,
    prerelease_version: string,
    build_suffix: string,
) {
    // Generate the full version string
    if (prerelease_version) {
        if (build_suffix) {
            return `${release_version}-${prerelease_version}.${build_suffix}`;
        }

        return `${release_version}-${prerelease_version}`;
    }

    if (build_suffix) {
        return `${release_version}-${build_suffix}`;
    }

    return release_version;
}

export function getSimpleVersion(
    file_version: string,
    arg_build_num: string,
    arg_release: boolean,
    patch: boolean,
) {
    // Azure DevOp pass in the build number as $(buildNum).$(buildAttempt).
    // Get the Build number and ignore the attempt number.
    // eslint-disable-next-line unicorn/prefer-number-properties, radix
    const build_id = patch ? parseInt(arg_build_num.split(".")[0]) : undefined;

    const { release_version, prerelease_version } = parseFileVersion(file_version, build_id);
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    const build_suffix = build_id ? "" : getBuildSuffix(arg_release, arg_build_num);
    const fullVersion = generateSimpleVersion(release_version, prerelease_version, build_suffix);
    return fullVersion;
}

type TagPrefix = string | "client" | "server" | "azure";

/**
 * @param prefix - The tag prefix to filter the tags by (client, server, etc.).
 * @param tags - An array of tags as strings.
 * @returns An array of tags that match the prefix.
 */
const filterTags = (prefix: TagPrefix, tags: string[]): string[] =>
    tags.filter((v) => v.startsWith(`${prefix}_v`));

/**
 * Extracts versions from an array of strings, sorts them according to semver rules, and returns the sorted array.
 *
 * @param prefix - The tag prefix to filter the tags by (client, server, etc.).
 * @param tags - An array of tags as strings.
 * @returns An array of versions extracted from the provided tags.
 */
export function getVersionsFromStrings(prefix: TagPrefix, tags: string[]) {
    const filtered = filterTags(prefix, tags);
    const versions = filtered.map((tag) => tag.slice(`${prefix}_v`.length));
    sort_semver(versions);
    return versions;
}

/**
 * @param prefix - The tag prefix to filter the tags by (client, server, etc.).
 * @param current_version  - The version to test; that is, the version to check for being the latest build.
 * @returns true if the current version is to be considered the latest (higher than the tagged releases _and NOT_ a
 * pre-release version).
 */
// eslint-disable-next-line max-params
export function getIsLatest(
    prefix: TagPrefix,
    current_version: string,
    input_tags: string[],
    // eslint-disable-next-line default-param-last
    includeInternalVersions = false,
    log?: Logger,
) {
    const versions = input_tags.filter((t) => {
        if (t === undefined) {
            return false;
        }

        if (!t.startsWith(`${prefix}_v`)) {
            return false;
        }

        if (includeInternalVersions) {
            return true;
        }

        const v = getVersionFromTag(t);
        if (v === undefined) {
            return false;
        }

        return !isInternalVersionScheme(v);
    });
    const latestTaggedRelease = getLatestReleaseFromList(versions);

    log?.log(`Latest tagged: ${latestTaggedRelease}, current: ${current_version}`);
    const currentIsGreater = gte_semver(current_version, latestTaggedRelease);
    const currentIsPrerelease = includeInternalVersions
        ? detectVersionScheme(current_version) === "internalPrerelease"
        : prerelease_semver(current_version) !== null;

    return currentIsGreater && !currentIsPrerelease;
}
