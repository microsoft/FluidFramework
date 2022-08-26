/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as childProcess from "child_process";
import * as fs from "fs";
import { getSimpleVersion, getIsLatest } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import { BaseCommand } from "../../base";

/**
 * This command class is used to compute the version number of Fluid packages. The release version number is based on
 * what's in the lerna.json/package.json. The CI pipeline will supply the build number and branch to determine the
 * prerelease suffix if it is not a tagged build.
 */
export default class GenerateBuildVersionCommand extends BaseCommand<
    typeof GenerateBuildVersionCommand.flags
> {
    static description = `This command is used to compute the version number of Fluid packages. The release version number is based on what's in the lerna.json/package.json. The CI pipeline will supply the build number and branch to determine the prerelease suffix if it is not a tagged build`;

    static examples = ["<%= config.bin %> <%= command.id %>"];

    static flags = {
        build: Flags.string({
            description: "The CI build number.",
            env: "VERSION_BUILDNUMBER",
            required: true,
        }),
        testBuild: Flags.string({
            description: "Indicates the build is a test build.",
            env: "TEST_BUILD",
        }),
        release: Flags.string({
            description: "Indicates the build is a release build.",
            options: ["release", "none"],
            env: "VERSION_RELEASE",
        }),
        patch: Flags.string({
            description: "Indicates the build is a patch build.",
            env: "VERSION_PATCH",
        }),
        base: Flags.string({
            description:
                "The base version. This will be read from lerna.json/package.json if not provided.",
        }),
        tag: Flags.string({
            description: "The tag name to use.",
            env: "VERSION_TAGNAME",
        }),
        includeInternalVersions: Flags.string({
            char: "i",
            description: "Include Fluid internal versions.",
            env: "VERSION_INCLUDE_INTERNAL_VERSIONS",
        }),
        fileVersion: Flags.string({
            description:
                "Will be used as the version instead of reading from package.json/lerna.json. Used for testing.",
            hidden: true,
        }),
        tags: Flags.string({
            description:
                "The git tags to consider when determining whether a version is latest. Used for testing.",
            hidden: true,
            multiple: true,
        }),
        ...BaseCommand.flags,
    };

    public async run(): Promise<void> {
        const context = await this.getContext();
        const flags = this.processedFlags;
        const isRelease = flags.release === "release";
        const useSimplePatchVersion = flags.patch?.toLowerCase() === "true";
        const useTestVersion = flags.testBuild?.toLowerCase() === "true";
        const shouldIncludeInternalVersions =
            flags.includeInternalVersions?.toLowerCase() === "true";

        let fileVersion = "";

        if (flags.base === undefined) {
            fileVersion = flags.fileVersion ?? this.getFileVersion();
            if (!fileVersion) {
                this.error("Missing version in lerna.json/package.json");
            }
        }

        if (flags.testBuild?.toLowerCase() === "true" && isRelease) {
            this.error("Test build shouldn't be released");
        }

        if (!useSimplePatchVersion && flags.tag !== undefined) {
            const tagName = `${flags.tag}_v${fileVersion}`;
            const out = childProcess.execSync(`git tag -l ${tagName}`, { encoding: "utf8" });
            if (out.trim() === tagName) {
                if (isRelease) {
                    this.error(`Tag ${tagName} already exist`);
                }

                this.warn(`Tag ${tagName} already exist`);
            }
        }

        // Generate and print the version to console
        const simpleVersion = getSimpleVersion(
            fileVersion,
            flags.build,
            isRelease,
            useSimplePatchVersion,
        );
        const version = useTestVersion ? `0.0.0-${flags.build}-test` : simpleVersion;
        this.log(`version=${version}`);
        this.log(`##vso[task.setvariable variable=version;isOutput=true]${version}`);

        // Output the code version for test builds. This is used in the CI system.
        // See common/build/build-common/gen_version.js
        if (useTestVersion) {
            const codeVersion = `${simpleVersion}-test`;
            this.log(`codeVersion=${codeVersion}`);
            this.log(`##vso[task.setvariable variable=codeVersion;isOutput=true]${codeVersion}`);
        }

        const tags = flags.tags ?? (await context.gitRepo.getAllTags());
        if (flags.tag !== undefined) {
            const isLatest = getIsLatest(
                flags.tag,
                version,
                tags,
                shouldIncludeInternalVersions,
                await this.getLogger(),
            );
            this.log(`isLatest=${isLatest}`);
            if (isRelease && isLatest === true) {
                this.log(`##vso[task.setvariable variable=isLatest;isOutput=true]${isLatest}`);
            }
        }
    }

    private getFileVersion() {
        if (fs.existsSync("./lerna.json")) {
            // eslint-disable-next-line unicorn/prefer-json-parse-buffer
            return JSON.parse(fs.readFileSync("./lerna.json", { encoding: "utf8" }))
                .version as string;
        }

        if (fs.existsSync("./package.json")) {
            // eslint-disable-next-line unicorn/prefer-json-parse-buffer
            return JSON.parse(fs.readFileSync("./package.json", { encoding: "utf8" }))
                .version as string;
        }

        this.error(`lerna.json or package.json not found`);
    }
}
