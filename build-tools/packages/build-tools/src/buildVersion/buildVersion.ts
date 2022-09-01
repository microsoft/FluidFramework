/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import child_process from "child_process";
import { getFileVersion, getIsLatest, getSimpleVersion } from "./buildVersionLib";

function main() {
    let arg_build_num: string | undefined;
    let arg_test_build = false;
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

        if (process.argv[i] === "--testBuild") {
            arg_test_build = true;
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

    if (!arg_build_num) {
        arg_build_num = process.env["VERSION_BUILDNUMBER"];
        if (!arg_build_num) {
            console.error("ERROR: Missing VERSION_BUILDNUMBER environment variable");
            process.exit(3);
        }
    }

    if (!arg_test_build) {
        arg_test_build = (process.env["TEST_BUILD"] === "true");
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

    if (arg_test_build && arg_release) {
        console.error("ERROR: Test build shouldn't be released");
        process.exit(2);
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
    const simpleVersion = getSimpleVersion(file_version, arg_build_num, arg_release, arg_patch);
    const version = arg_test_build ? `0.0.0-${arg_build_num}-test` : simpleVersion;
    console.log(`version=${version}`);
    console.log(`##vso[task.setvariable variable=version;isOutput=true]${version}`);

    // Output the code version for test builds. This is used in the CI system.
    // See common/build/build-common/gen_version.js
    if (arg_test_build) {
        const codeVersion = `${simpleVersion}-test`;
        console.log(`codeVersion=${codeVersion}`);
        console.log(`##vso[task.setvariable variable=codeVersion;isOutput=true]${codeVersion}`);
    }

    if (arg_tag !== undefined) {
        const includeInternalVersions = process.env["VERSION_INCLUDE_INTERNAL_VERSIONS"] === "true"
            || process.env["VERSION_INCLUDE_INTERNAL_VERSIONS"] === "True";
        const isLatest = getIsLatest(arg_tag, version, undefined, includeInternalVersions);
        console.log(`isLatest=${isLatest}`);
        if (arg_release && isLatest) {
            console.log(`##vso[task.setvariable variable=isLatest;isOutput=true]${isLatest}`);
        }
    }
}

main();
