/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { ArgInput } from "@oclif/core/lib/interfaces";
import { strict as assert } from "assert";
import chalk from "chalk";
import inquirer from "inquirer";
import stripAnsi from "strip-ansi";

import { FluidRepo, MonoRepo, Package } from "@fluidframework/build-tools";

import {
    ReleaseVersion,
    VersionScheme,
    bumpVersionScheme,
    detectVersionScheme,
} from "@fluid-tools/version-tools";

import { packageOrReleaseGroupArg } from "../args";
import { BaseCommand } from "../base";
import { bumpTypeFlag, checkFlags, skipCheckFlag, versionSchemeFlag } from "../flags";
import { bumpReleaseGroup, generateBumpVersionBranchName } from "../lib";
import { isReleaseGroup } from "../releaseGroups";

export default class BumpCommand extends BaseCommand<typeof BumpCommand.flags> {
    static summary =
        "Bumps the version of a release group or package to the next minor, major, or patch version.";

    static description = `The bump command is used to bump the version of a release groups or individual packages within the repo. Typically this is done as part of the release process (see the release command), but it is sometimes useful to bump without doing a release.`;

    static args: ArgInput = [packageOrReleaseGroupArg];

    static flags = {
        bumpType: bumpTypeFlag({
            char: "t",
            description:
                "Bump the release group or package to the next version according to this bump type.",
            required: true,
        }),
        scheme: versionSchemeFlag({
            description: "Override the version scheme used by the release group or package.",
            required: false,
        }),
        commit: checkFlags.commit,
        install: checkFlags.install,
        skipChecks: skipCheckFlag,
        ...BaseCommand.flags,
    };

    static examples = [
        {
            description: "Bump @fluidframework/build-common to the next minor version.",
            command: "<%= config.bin %> <%= command.id %> @fluidframework/build-common -t minor",
        },
        {
            description:
                "Bump the server release group to the next major version, forcing the semver version scheme.",
            command: "<%= config.bin %> <%= command.id %> server -t major --scheme semver",
        },
        {
            description:
                "By default, the bump command will run npm install in any affected packages and commit the results to a new branch. You can skip these steps using the --no-commit and --no-install flags.",
            command: "<%= config.bin %> <%= command.id %> server -t major --no-commit --no-install",
        },
    ];

    /**
     * An array of messages that will be shown after the command runs.
     */
    private readonly finalMessages: string[] = [];

    public async run(): Promise<void> {
        const args = this.processedArgs;
        const flags = this.processedFlags;

        const context = await this.getContext();
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const bumpType = flags.bumpType!;
        const shouldInstall = flags.install && !flags.skipChecks;
        const shouldCommit = flags.commit && !flags.skipChecks;

        if (args.package_or_release_group === undefined) {
            this.error("ERROR: No dependency provided.");
        }

        let repoVersion: ReleaseVersion;
        let packageOrReleaseGroup: Package | MonoRepo;
        let scheme: VersionScheme | undefined;
        const updatedPackages: Package[] = [];

        if (isReleaseGroup(args.package_or_release_group)) {
            const releaseRepo = context.repo.releaseGroups.get(args.package_or_release_group);
            assert(
                releaseRepo !== undefined,
                `Release repo not found for ${args.package_or_release_group}`,
            );

            repoVersion = releaseRepo.version;
            scheme = flags.scheme ?? detectVersionScheme(repoVersion);
            updatedPackages.push(...releaseRepo.packages);
            packageOrReleaseGroup = releaseRepo;
        } else {
            const releasePackage = context.fullPackageMap.get(args.package_or_release_group);
            if (releasePackage === undefined) {
                this.error(`Package not in context: ${releasePackage}`);
            }

            if (releasePackage.monoRepo !== undefined) {
                const rg = releasePackage.monoRepo.kind;
                this.errorLog(`${releasePackage.name} is part of the ${rg} release group.`);
                this.errorLog(
                    `If you want to bump that package, run the following command to bump the whole release group:\n\n    ${
                        this.config.bin
                    } ${this.id} ${rg} ${this.argv.slice(1).join(" ")}`,
                );
                this.exit(1);
            }

            repoVersion = releasePackage.version;
            scheme = flags.scheme ?? detectVersionScheme(repoVersion);
            updatedPackages.push(releasePackage);
            packageOrReleaseGroup = releasePackage;
        }

        const newVersion = bumpVersionScheme(repoVersion, bumpType, scheme).version;

        this.logHr();
        this.log(`Release group: ${chalk.blueBright(args.package_or_release_group)}`);
        this.log(`Bump type: ${chalk.blue(bumpType)}`);
        this.log(`Versions: ${newVersion} <== ${repoVersion}`);
        this.log(`Install: ${shouldInstall ? chalk.green("yes") : "no"}`);
        this.log(`Commit: ${shouldCommit ? chalk.green("yes") : "no"}`);
        this.logHr();
        this.log("");

        const confirmIntegratedQuestion: inquirer.ConfirmQuestion = {
            type: "confirm",
            name: "proceed",
            message: `Proceed with the bump?`,
        };

        const answers = await inquirer.prompt(confirmIntegratedQuestion);
        if (answers.proceed !== true) {
            this.info(`Cancelled.`);
            this.exit(0);
        }

        const logs = await bumpReleaseGroup(context, bumpType, packageOrReleaseGroup, scheme);
        this.verbose(logs);

        if (shouldInstall) {
            if (!(await FluidRepo.ensureInstalled(updatedPackages, false))) {
                this.error("Install failed.");
            }
        } else {
            this.warning(`Skipping installation. Lockfiles might be outdated.`);
        }

        if (shouldCommit) {
            const commitMessage = stripAnsi(
                `Bump ${packageOrReleaseGroup} to ${newVersion} (${bumpType} bump)`,
            );

            const bumpBranch = generateBumpVersionBranchName(
                args.package_or_release_group,
                bumpType,
                repoVersion,
            );
            this.log(`Creating branch ${bumpBranch}`);
            await context.createBranch(bumpBranch);
            await context.gitRepo.commit(commitMessage, "Error committing");
            this.finalMessages.push(
                `You can now create a PR for branch ${bumpBranch} targeting ${context.originalBranchName}`,
            );
        } else {
            this.warning(`Skipping commit. You'll need to manually commit changes.`);
        }

        if (this.finalMessages.length > 0) {
            this.logHr();
            for (const msg of this.finalMessages) {
                this.log(msg);
            }
        }
    }
}
