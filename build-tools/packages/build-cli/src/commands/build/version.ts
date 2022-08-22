/* eslint-disable no-negated-condition */
/* eslint-disable unicorn/prefer-string-slice */
/* eslint-disable radix */
/* eslint-disable unicorn/prefer-number-properties */
/* eslint-disable unicorn/prefer-json-parse-buffer */
/* eslint-disable padding-line-between-statements */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable dot-notation */
/* eslint-disable @typescript-eslint/dot-notation */
/* eslint-disable complexity */
/* eslint-disable camelcase */
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import child_process from "child_process";
import fs from "fs";
import { Flags } from "@oclif/core";
import { Timer, test } from "@fluidframework/build-tools";
import { sort as sort_semver, gt as gt_semver, prerelease as prerelease_semver } from "semver";
import { BaseCommand } from "../../base";

export class BuildVersion extends BaseCommand<typeof BuildVersion.flags> {
    static description =
        "Checks that the dependencies between Fluid Framework packages are properly layered.";

    static flags = {
        build: Flags.integer({
            description: `Build Number`,
            required: false,
        }),
        testBuild: Flags.boolean({
            description: "test the build",
            required: false,
        }),
        release: Flags.boolean({
            description: "release the build",
            required: false,
        }),
        patch: Flags.boolean({
            description: "patch the build",
            required: false,
        }),
        base: Flags.string({
            description: "base",
            required: false,
        }),
        test: Flags.boolean({
            description: "test the build",
            required: false,
        }),
        tag: Flags.string({
            description: "tag the build",
            required: false,
        }),
        ...BaseCommand.flags,
    };

    async run() {
        let arg_test_build = false;
        let arg_patch = false;
        let arg_release = false;
        let arg_tag: string | undefined;
        const flags = this.processedFlags;
        const timer = new Timer(flags.timer);

        if (flags.testBuild) {
            arg_test_build = true;
        }

        if (flags.release) {
            arg_release = true;
        }

        if (flags.patch) {
            arg_patch = true;
        }

        const file_version: string = typeof flags.base === "string" ? flags.base : getFileVersion();

        if(flags.build === undefined && process.env["VERSION_BUILDNUMBER"] === undefined){
            this.error("ERROR: Missing VERSION_BUILDNUMBER environment variable");
        }

        const arg_build_num: string | undefined =
            typeof flags.build === "number"
                ? flags.build.toString()
                : process.env["VERSION_BUILDNUMBER"]

        if (flags.test) {
            test();
            this.exit(0);
        }

        if (typeof flags.tag === "string") {
            arg_tag = flags.tag;
        }

        if (!arg_test_build) {
            arg_test_build = process.env["TEST_BUILD"] === "true";
        }

        if (!arg_patch) {
            arg_patch = process.env["VERSION_PATCH"] === "true";
        }

        if (!arg_release) {
            arg_release = process.env["VERSION_RELEASE"] === "release";
        }

        if (arg_tag === undefined) {
            arg_tag = process.env["VERSION_TAGNAME"];
        }

        if (arg_test_build && arg_release) {
            this.error("ERROR: Test build shouldn't be released");
        }

        if (file_version === undefined) {
            this.error("ERROR: Missing version in lerna.json/package.json");
        }

        if (arg_build_num === undefined) {
            this.error("ERROR: Missing VERSION_BUILDNUMBER environment variable");
        }

        if (!arg_patch && typeof arg_tag === "string") {
            const tagName = `${arg_tag}_v${file_version}`;
            const out = child_process.execSync(`git tag -l ${tagName}`, { encoding: "utf8" });
            if (out.trim() === tagName) {
                if (arg_release) {
                    this.error(`ERROR: Tag ${tagName} already exist`);
                }

                this.warn(`WARNING: Tag ${tagName} already exist`);
            }
        }

        // Generate and print the version to console
        const simpleVersion = getSimpleVersion(file_version, arg_build_num, arg_release, arg_patch);
        const version = arg_test_build ? `0.0.0-${arg_build_num}-test` : simpleVersion;
        this.log(`version=${version}`);
        this.log(`##vso[task.setvariable variable=version;isOutput=true]${version}`);

        // Output the code version for test builds. This is used in the CI system.
        // See common/build/build-common/gen_version.js
        if (arg_test_build) {
            const codeVersion = `${simpleVersion}-test`;
            this.log(`codeVersion=${codeVersion}`);
            this.log(`##vso[task.setvariable variable=codeVersion;isOutput=true]${codeVersion}`);
        }

        if (arg_tag !== undefined) {
            const isLatest = getIsLatest(arg_tag, version);
            this.log(`isLatest=${isLatest}`);
            if (arg_release && isLatest) {
                this.log(`##vso[task.setvariable variable=isLatest;isOutput=true]${isLatest}`);
            }
        }

        timer.time("Build Version completed");

        this.log(`Build Version passed`);
    }
}

function getFileVersion() {
    if (fs.existsSync("./lerna.json")) {
        return JSON.parse(fs.readFileSync("./lerna.json", { encoding: "utf8" })).version;
    }
    if (fs.existsSync("./package.json")) {
        return JSON.parse(fs.readFileSync("./package.json", { encoding: "utf8" })).version;
    }
    console.error(`ERROR: lerna.json or package.json not found`);
}

function parseFileVersion(file_version: string, build_id?: number) {
    const split = file_version.split("-");
    let release_version = split[0];
    split.shift();
    const prerelease_version = split.join("-");

    /**
     * Use the build id for patch number if given
     */
    if (build_id) {
        // split the prerelease out
        const r = release_version.split(".");
        if (r.length !== 3) {
            console.error(`ERROR: Invalid format for release version ${release_version}`);
            throw new Error("5");
        }
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
    const build_id = patch ? parseInt(arg_build_num.split(".")[0]) : undefined;
    try {
        const { release_version, prerelease_version } = parseFileVersion(file_version, build_id);
        const build_suffix = build_id ? "" : getBuildSuffix(arg_release, arg_build_num);
        const fullVersion = generateSimpleVersion(
            release_version,
            prerelease_version,
            build_suffix,
        );
        return fullVersion;
    } catch {
        throw new Error("5");
    }
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
 * Extracts versions from the output of `git tag -l` in the working directory. The returned array will be sorted
 * ascending by semver version rules.
 *
 * @param prefix - The tag prefix to filter the tags by (client, server, etc.).
 * @returns An array of versions extracted from the output of `git tag -l`.
 */
function getVersions(prefix: TagPrefix) {
    const raw_tags = child_process.execSync(`git tag -l`, { encoding: "utf8" });
    const tags = raw_tags.split(/\s+/g).map((t) => t.trim());
    return getVersionsFromStrings(prefix, tags);
}

/**
 * Extracts versions from an array of strings, sorts them according to semver rules, and returns the sorted array.
 *
 * @param prefix - The tag prefix to filter the tags by (client, server, etc.).
 * @param tags - An array of tags as strings.
 * @returns An array of versions extracted from the provided tags.
 */
export function getVersionsFromStrings(prefix: TagPrefix, tags: string[]) {
    const filtered = filterTags(prefix, tags);
    const versions = filtered.map((tag) => tag.substring(`${prefix}_v`.length));
    sort_semver(versions);
    return versions;
}

/**
 * @param prefix - The tag prefix to filter the tags by (client, server, etc.).
 * @param current_version  - The version to test; that is, the version to check for being the latest build.
 * @returns true if the current version is to be considered the latest (higher than the tagged releases _and NOT_ a
 * pre-release version).
 */
export function getIsLatest(prefix: TagPrefix, current_version: string, input_tags?: string[]) {
    const versions =
        input_tags !== undefined ? getVersionsFromStrings(prefix, input_tags) : getVersions(prefix);

    // The last item in the array is the latest because the array is already sorted.
    const latestTaggedRelease = versions.slice(-1)[0] ?? "0.0.0";

    console.log(`Latest tagged: ${latestTaggedRelease}, current: ${current_version}`);
    const currentIsGreater = gt_semver(current_version, latestTaggedRelease);
    const currentIsPrerelease = prerelease_semver(current_version) !== null;
    return currentIsGreater && !currentIsPrerelease;
}
