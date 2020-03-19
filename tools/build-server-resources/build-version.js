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
 * Output:
 *      The computed version output to the console.
 */

const fs = require("fs");
function getFileVersion() {
    if (fs.existsSync("./lerna.json")) {
        return JSON.parse(fs.readFileSync("./lerna.json")).version;
    }
    if (fs.existsSync("./package.json")) {
        return JSON.parse(fs.readFileSync("./package.json")).version;
    }
    console.error(`ERROR: lerna.json or package.json not found`);
    process.exit(1);
}

function parseFileVersion(file_version, build_num) {
    let split = file_version.split("-");
    let release_version = split[0];
    split.shift();
    let prerelease_version = split.join("-");

    /**
     * Back compat. Version <= 0.15 we use the build number as the patch number.
     */

    // split the prerelease out
    const r = release_version.split('.');
    if (r.length !== 3) {
        console.error(`ERROR: Invalid format for release version ${release_version}`);
        process.exist(5);
    }

    if (r[0] === "0" && parseInt(r[1]) <= 15) {
        r[2] = parseInt(r[2]) + parseInt(build_num);
        release_version = r.join('.');
    }

    return { release_version, prerelease_version };
}

/**
 * Compute the build suffix
 *
 * If the build is trigger by tags, no suffix is needed (those are released bits).
 * Otherwise it is a CI only build, and we add the following suffix depending on the branch
 *     PRs:               refs/pull/*                             | ci.<build_number>.dev
 *     Official branches: refs/heads/master, refs/heads/release/* | ci.<build_number>.official
 *     Manual builds:     <all others>                            | ci.<build_number>.manual
 */
function getBuildSuffix(env_build_branch, build_num) {
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

    // PRs
    if (build_branch[1] === 'pull') {
        return `ci.${build_num}.dev`
    }

    // master or release branches
    if (build_branch[1] === 'heads' && (build_branch[2] === 'master' || build_branch[2] === "release")) {
        /**
         * Back compat. Version 0.15 not using tag to release yet.
         */
        if (build_branch[2] === "release" && build_branch[3] === "0.15") {
            return "";
        }
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

function getFullVersion(file_version, env_build_num, env_build_branch) {
    // Azure DevOp pass in the build number as $(buildNum).$(buildAttempt).
    // Get the Build number and ignore the attempt number.
    const build_num = parseInt(env_build_num.split('.')[0]);
    const { release_version, prerelease_version } = parseFileVersion(file_version, build_num);
    const build_suffix = getBuildSuffix(env_build_branch, build_num)
    const fullVersion = generateFullVersion(release_version, prerelease_version, build_suffix);
    return fullVersion;
}

function main() {
    const env_build_num = process.env["VERSION_BUILDNUMBER"];
    const env_build_branch = process.env["VERSION_BUILDBRANCH"];
    const file_version = getFileVersion();
    if (!file_version) {
        console.error("ERROR: Missing version in lerna.json/package.json");
        process.exit(2);
    }

    if (!env_build_num) {
        console.error("ERROR: Missing VERSION_BUILDNUMBER environment variable");
        process.exit(3);
    }

    if (!env_build_branch) {
        console.error("ERROR: Missing VERSION_BUILD_BRANCH environment variable");
        process.exit(4);
    }
    console.log(getFullVersion(file_version, env_build_num, env_build_branch));
}

main();

/*
const assert = require("assert").strict;
function test() {
    // Test version <= 0.15, no prerelease
    assert.equal(getFullVersion("0.15.0", "12345.0", "refs/pull/blah"), "0.15.12345--ci.12345.dev");
    assert.equal(getFullVersion("0.15.0", "12345.0", "refs/heads/master"), "0.15.12345--ci.12345.official");
    assert.equal(getFullVersion("0.15.0", "12345.0", "refs/heads/release/0.15"), "0.15.12345");
    assert.equal(getFullVersion("0.15.0", "12345.0", "refs/heads/blah"), "0.15.12345--ci.12345.manual");
    assert.equal(getFullVersion("0.15.0", "12345.0", "refs/tags/v0.15.x"), "0.15.12345");

    // Test version <= 0.15, with prerelease
    assert.equal(getFullVersion("0.15.0-rc", "12345.0", "refs/pull/blah"), "0.15.12345-rc.0.0.ci.12345.dev");
    assert.equal(getFullVersion("0.15.0-alpha.1", "12345.0", "refs/heads/master"), "0.15.12345-alpha.1.0.ci.12345.official");
    assert.equal(getFullVersion("0.15.0-beta.2.1", "12345.0", "refs/heads/release/0.15"), "0.15.12345-beta.2.1");
    assert.equal(getFullVersion("0.15.0-beta.2.1", "12345.0", "refs/heads/blah"), "0.15.12345-beta.2.1.ci.12345.manual");
    assert.equal(getFullVersion("0.15.0-beta", "12345.0", "refs/tags/v0.15.x"), "0.15.12345-beta");

    // Test version >= 0.16, no prerelease
    assert.equal(getFullVersion("0.16.0", "12345.0", "refs/pull/blah"), "0.16.0--ci.12345.dev");
    assert.equal(getFullVersion("0.16.0", "12345.0", "refs/heads/master"), "0.16.0--ci.12345.official");
    assert.equal(getFullVersion("0.16.0", "12345.0", "refs/heads/release/0.16.0"), "0.16.0--ci.12345.official");
    assert.equal(getFullVersion("0.16.0", "12345.0", "refs/heads/blah"), "0.16.0--ci.12345.manual");
    assert.equal(getFullVersion("0.16.0", "12345.0", "refs/tags/v0.16.0"), "0.16.0");

    // Test version >= 0.16, with prerelease
    assert.equal(getFullVersion("0.16.0-rc", "12345.0", "refs/pull/blah"), "0.16.0-rc.0.0.ci.12345.dev");
    assert.equal(getFullVersion("0.16.0-alpha.1", "12345.0", "refs/heads/master"), "0.16.0-alpha.1.0.ci.12345.official");
    assert.equal(getFullVersion("0.16.0-beta.2.1", "12345.0", "refs/heads/release/0.16.1"), "0.16.0-beta.2.1.ci.12345.official");
    assert.equal(getFullVersion("0.16.0-beta.2.1", "12345.0", "refs/heads/blah"), "0.16.0-beta.2.1.ci.12345.manual");
    assert.equal(getFullVersion("0.16.0-beta", "12345.0", "refs/tags/v0.16.0"), "0.16.0-beta");

    console.log("Test passed!");
}

test();
*/