/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable camelcase */

import child_process from "child_process";
import * as fs from "fs";
import { getSimpleVersion, getIsLatest } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import { BaseCommand } from "../../base";

export default class GenerateBuildVersionCommand extends BaseCommand<
    typeof GenerateBuildVersionCommand.flags
> {
    static description = `This command is used to compute the version number of Fluid packages. The release version number is based on what's in the lerna.json/package.json. The CI will supply the build number and branch to determine the prerelease suffix if it is not a tagged build`;

    static examples = ["<%= config.bin %> <%= command.id %>"];

    static flags = {
        build: Flags.string({
            description: "The CI build number.",
            env: "VERSION_BUILDNUMBER",
            required: true,
        }),
        testBuild: Flags.boolean({
            description: "Indicates the build is a test build.",
            env: "TEST_BUILD",
        }),
        release: Flags.string({
            description: "Indicates the build is a release build.",
            options: ["release"],
            env: "VERSION_RELEASE",
        }),
        patch: Flags.boolean({
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
        includeInternalVersions: Flags.boolean({
            char: "i",
            description: "Include Fluid internal versions.",
            env: "VERSION_INCLUDE_INTERNAL_VERSIONS",
        }),
        test: Flags.boolean({}),
        ...BaseCommand.flags,
    };

    static args = [{ name: "file" }];

    public async run(): Promise<void> {
        const context = await this.getContext();
        const flags = this.processedFlags;
        const isRelease = flags.release === "release";
        let fileVersion = "";

        if (flags.testBuild === true && isRelease) {
            this.error("Test build shouldn't be released");
            this.exit(2);
        }

        if (flags.base === undefined) {
            fileVersion = this.getFileVersion();
            if (!fileVersion) {
                this.error("Missing version in lerna.json/package.json");
                this.exit(6);
            }
        }

        if (flags.patch === false && flags.tag !== undefined) {
            const tagName = `${flags.tag}_v${fileVersion}`;
            const out = child_process.execSync(`git tag -l ${tagName}`, { encoding: "utf8" });
            if (out.trim() === tagName) {
                if (isRelease) {
                    this.error(`Tag ${tagName} already exist`);
                    this.exit(7);
                }

                this.warn(`Tag ${tagName} already exist`);
            }
        }

        // Generate and print the version to console
        const simpleVersion = getSimpleVersion(fileVersion, flags.build, isRelease, flags.patch);
        const version = flags.testBuild ? `0.0.0-${flags.build}-test` : simpleVersion;
        this.log(`version=${version}`);
        this.log(`##vso[task.setvariable variable=version;isOutput=true]${version}`);

        // Output the code version for test builds. This is used in the CI system.
        // See common/build/build-common/gen_version.js
        if (flags.testBuild) {
            const codeVersion = `${simpleVersion}-test`;
            this.log(`codeVersion=${codeVersion}`);
            this.log(`##vso[task.setvariable variable=codeVersion;isOutput=true]${codeVersion}`);
        }

        const tags = await context.gitRepo.getAllTags();
        if (flags.tag !== undefined) {
            const isLatest = getIsLatest(flags.tag, version, tags, flags.includeInternalVersions);
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
