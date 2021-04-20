/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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

import fs from "fs";
import child_process from "child_process";
import { test } from "./buildVersionTests";

function getFileVersion() {
    if (fs.existsSync("./lerna.json")) {
        return JSON.parse(fs.readFileSync("./lerna.json", { encoding: "utf8" })).version;
    }
    if (fs.existsSync("./package.json")) {
        return JSON.parse(fs.readFileSync("./package.json", { encoding: "utf8" })).version;
    }
    console.error(`ERROR: lerna.json or package.json not found`);
    process.exit(5);
}

function parseFileVersion(file_version: string, build_id?: number) {
    let split = file_version.split("-");
    let release_version = split[0];
    split.shift();
    let prerelease_version = split.join("-");

    /**
     * Use the build id for patch number if given
     */
    if (build_id) {
        // split the prerelease out
        const r = release_version.split('.');
        if (r.length !== 3) {
            console.error(`ERROR: Invalid format for release version ${release_version}`);
            process.exit(9);
        }
        r[2] = (parseInt(r[2]) + build_id).toString();
        release_version = r.join('.');
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
function generateSimpleVersion(release_version: string, prerelease_version: string, build_suffix: string) {
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

export function getSimpleVersion(file_version: string, arg_build_num: string, arg_release: boolean, patch: boolean) {
    // Azure DevOp pass in the build number as $(buildNum).$(buildAttempt).
    // Get the Build number and ignore the attempt number.
    const build_id = patch ? parseInt(arg_build_num.split('.')[0]) : undefined;

    const { release_version, prerelease_version } = parseFileVersion(file_version, build_id);
    const build_suffix = build_id ? "" : getBuildSuffix(arg_release, arg_build_num);
    const fullVersion = generateSimpleVersion(release_version, prerelease_version, build_suffix);
    return fullVersion;
}

function main() {
    let arg_build_num: string | undefined;
    let arg_patch = false;
    let arg_release = false;
    let file_version: string | undefined;
    let arg_test = false;
    let arg_tag: string | undefined;
    for (let i = 2; i < process.argv.length; i++) {
        if (process.argv[i] === "--build") {
            arg_build_num = process.argv[++i];
            continue;
        }

        if (process.argv[i] === "--release") {
            arg_release = true;
            continue;
        }

        if (process.argv[i] === "--patch") {
            arg_patch = true;
            continue;
        }

        if (process.argv[i] === "--base") {
            file_version = process.argv[++i];
            continue;
        }

        if (process.argv[i] === "--test") {
            arg_test = true;
            continue;
        }

        if (process.argv[i] === "--tag") {
            arg_tag = process.argv[++i];
            continue;
        }
        console.log(`ERROR: Invalid argument ${process.argv[i]}`);
        process.exit(1)
    }

    if (arg_test) {
        test();
        process.exit(0);
    }

    if (!arg_build_num) {
        arg_build_num = process.env["VERSION_BUILDNUMBER"];
        if (!arg_build_num) {
            console.error("ERROR: Missing VERSION_BUILDNUMBER environment variable");
            process.exit(3);
        }
    }

    if (!arg_patch) {
        arg_patch = (process.env["VERSION_PATCH"] === "true");
    }

    if (!arg_release) {
        arg_release = (process.env["VERSION_RELEASE"] === "release");
    }

    if (!arg_tag) {
        arg_tag = process.env["VERSION_TAGNAME"];
    }

    if (!file_version) {
        file_version = getFileVersion();
        if (!file_version) {
            console.error("ERROR: Missing version in lerna.json/package.json");
            process.exit(6);
        }
    }

    if (!arg_patch && arg_tag) {
        const tagName = `${arg_tag}_v${file_version}`;
        const out = child_process.execSync(`git tag -l ${tagName}`, { encoding: "utf8" });
        if (out.trim() === tagName) {
            if (arg_release) {
                console.error(`ERROR: Tag ${tagName} already exist`);
                process.exit(7);
            }
            console.warn(`WARNING: Tag ${tagName} already exist`);
        }
    }

    // Generate and print the version to console
    const version = getSimpleVersion(file_version, arg_build_num, arg_release, arg_patch);
    console.log(`version=${version}`);
    console.log(`##vso[task.setvariable variable=version;isOutput=true]${version}`);
    if (arg_release) {
        let isLatest = true;
        if (arg_tag) {
            const split = version.split(".");
            if (split.length !== 3) {
                console.error(`ERROR: Invalid format for release version ${version}`);
                process.exit(8);
            }
            const tagName = `${arg_tag}_v${split[0]}.${parseInt(split[1]) + 1}.*`;
            const out = child_process.execSync(`git tag -l ${tagName}`, { encoding: "utf8" });
            if (out.trim()) {
                isLatest = false;
            }
        }
        console.log(`isLatest=${isLatest}`);
        console.log(`##vso[task.setvariable variable=isLatest;isOutput=true]${isLatest}`);
    }
}

main();
