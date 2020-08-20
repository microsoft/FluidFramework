/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
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
 *      env:VERSION_BUILDBRANCH        - the build branch/tags that triggered the build
 *      env:VERSION_PATCH              - Put the build number in the patch
 * Output:
 *      The computed version output to the console.
 */

const fs = require("fs");
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

function parseFileVersion(file_version, build_id) {
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
            process.exit(6);
        }
        r[2] = (parseInt(r[2]) + build_id).toString();
        release_version = r.join('.');
    }
    return { release_version, prerelease_version };
}

/**
 * Compute the build suffix
 *
 * The suffix follows the CSemVer-CI format, see https://csemver.org/
 *
 * If the build is trigger by tags, no suffix is needed (those are released bits).
 * Otherwise it is a CI only build, and we add the following suffix depending on the branch
 *     PRs:               refs/pull/*                             | ci.<build_number>.dev
 *     Official branches: refs/heads/main, refs/heads/release/*   | ci.<build_number>.official
 *     Manual builds:     <all others>                            | ci.<build_number>.manual
 */
function getBuildSuffix(env_build_branch, build_num, isFull) {
    // Split the branch
    const build_branch = env_build_branch.split('/');
    if (build_branch[0] !== 'refs') {
        console.error(`ERROR: Invalid branch specification ${env_build_branch}`);
        process.exit(6);
    }

    // Suffix based on branch.

    // Tag releases
    if (build_branch[1] === 'tags') {
        return "";
    }

    if (!isFull) {
        return `${build_num}`;
    }

    // PRs
    if (build_branch[1] === 'pull') {
        return `ci.${build_num}.dev`;
    }

    // main or release branches
    if (build_branch[1] === 'heads' && (build_branch[2] === 'main' || build_branch[2] === "release")) {
        return `ci.${build_num}.official`;
    }

    // Otherwise, it is manual builds
    return `ci.${build_num}.manual`;
}

function generateFullVersion(release_version, prerelease_version, build_suffix) {
    // Generate the full version string
    if (prerelease_version) {
        if (build_suffix) {
            const p = prerelease_version.split('.');
            while (p.length < 3) {
                // pad it to at least 3 entries.
                p.push("0");
            }
            return `${release_version}-${p.join(".")}.${build_suffix}`;
        }
        return `${release_version}-${prerelease_version}`;
    }

    if (build_suffix) {
        // Add "--" between the release and the suffix
        // one "-" to start he prerelease version
        // another "-" so that CI build will precede other manually named prerelease build.
        return `${release_version}--${build_suffix}`;
    }

    return release_version;
}

function getFullVersion(file_version, arg_build_num, arg_build_branch, patch) {
    // Azure DevOp pass in the build number as $(buildNum).$(buildAttempt).
    // Get the Build number and ignore the attempt number.
    const build_id = patch ? parseInt(arg_build_num.split('.')[0]) : undefined;
    const { release_version, prerelease_version } = parseFileVersion(file_version, build_id);
    const build_suffix = build_id ? "" : getBuildSuffix(arg_build_branch, arg_build_num, true);
    const fullVersion = generateFullVersion(release_version, prerelease_version, build_suffix);
    return fullVersion;
}

/* A simpler CI version that append the build number at the end in the prerelease */
function generateSimpleVersion(release_version, prerelease_version, build_suffix) {
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

function getSimpleVersion(file_version, arg_build_num, arg_build_branch, patch) {
    // Azure DevOp pass in the build number as $(buildNum).$(buildAttempt).
    // Get the Build number and ignore the attempt number.
    const build_id = patch ? parseInt(arg_build_num.split('.')[0]) : undefined;
    const { release_version, prerelease_version } = parseFileVersion(file_version, build_id);
    const build_suffix = build_id ? "" : getBuildSuffix(arg_build_branch, arg_build_num, false);
    const fullVersion = generateSimpleVersion(release_version, prerelease_version, build_suffix);
    return fullVersion;
}

function main() {
    let isFull = false;
    let arg_build_num;
    let arg_patch = false;
    let arg_build_branch;
    let file_version;
    for (let i = 2; i < process.argv.length; i++) {
        if (process.argv[i] === "--full") {
            isFull = true;
            continue;
        }
        if (process.argv[i] === "--build") {
            arg_build_num = process.argv[++i];
            continue;
        }
        if (process.argv[i] === "--branch") {
            arg_build_branch = process.argv[++i];
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

        console.log(`ERROR: Invalid argument ${process.argv[i]}`);
        process.exit(1);
    }

    if (!arg_build_num) {
        arg_build_num = process.env["VERSION_BUILDNUMBER"];
        if (!arg_build_num) {
            console.error("ERROR: Missing VERSION_BUILDNUMBER environment variable");
            process.exit(3);
        }
    }

    if (!arg_patch) {
        arg_patch = !!process.env["VERSION_PATCH"];
    }

    if (!arg_build_branch) {
        arg_build_branch = process.env["VERSION_BUILDBRANCH"];
        if (!arg_build_branch) {
            console.error("ERROR: Missing VERSION_BUILDBRANCH environment variable");
            process.exit(5);
        }
    }

    if (!file_version) {
        file_version = getFileVersion();
        if (!file_version) {
            console.error("ERROR: Missing version in lerna.json/package.json");
            process.exit(6);
        }
    }

    if (isFull) {
        console.log(getFullVersion(file_version, arg_build_num, arg_build_branch, arg_patch));
    } else {
        console.log(getSimpleVersion(file_version, arg_build_num, arg_build_branch, arg_patch));
    }
}

main();
