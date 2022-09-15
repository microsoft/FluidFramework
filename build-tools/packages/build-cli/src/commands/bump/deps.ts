/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidRepo } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
// eslint-disable-next-line import/no-internal-modules
import type { ArgInput } from "@oclif/core/lib/interfaces";
import chalk from "chalk";
import stripAnsi from "strip-ansi";
import { BaseCommand } from "../../base";
import { checkFlags, dependencyUpdateTypeFlag, releaseGroupFlag, skipCheckFlag } from "../../flags";
import {
    generateBumpDepsBranchName,
    indentString,
    isDependencyUpdateType,
    npmCheckUpdates,
} from "../../lib";
import { isReleaseGroup, ReleaseGroup } from "../../releaseGroups";

/**
 * Update the dependency version of a specified package or release group. That is, if one or more packages in the repo
 * depend on package A, then this command will update the dependency range on package A. The dependencies and the
 * packages updated can be filtered using various flags.
 *
 * @remarks
 *
 * This command is roughly equivalent to `fluid-bump-version --dep`.
 */
export default class DepsCommand extends BaseCommand<typeof DepsCommand.flags> {
    static description =
        "Update the dependency version of a specified package or release group. That is, if one or more packages in the repo depend on package A, then this command will update the dependency range on package A. The dependencies and the packages updated can be filtered using various flags.";

    static args: ArgInput = [
        {
            name: "package_or_release_group",
            required: true,
            description:
                "The name of a package or a release group. Dependencies on these packages will be bumped.",
        },
    ];

    static flags = {
        updateType: dependencyUpdateTypeFlag({
            char: "t",
            description: "Bump the current version of the dependency according to this bump type.",
        }),
        prerelease: Flags.boolean({
            char: "p",
            dependsOn: ["updateType"],
            description: "Treat prerelease versions as valid versions to update to.",
        }),
        onlyBumpPrerelease: Flags.boolean({
            description: "Only bump dependencies that are on pre-release versions.",
        }),
        releaseGroup: releaseGroupFlag({
            description: "Only bump dependencies within this release group.",
        }),
        commit: checkFlags.commit,
        install: checkFlags.install,
        skipChecks: skipCheckFlag,
        ...BaseCommand.flags,
    };

    static examples = [
        {
            description:
                "Bump dependencies on @fluidframework/build-common to the latest release version across all release groups.",
            command: "<%= config.bin %> <%= command.id %> @fluidframework/build-common -t latest",
        },
        {
            description:
                "Bump dependencies on @fluidframework/build-common to the next minor version in the azure release group.",
            command:
                "<%= config.bin %> <%= command.id %> @fluidframework/build-common -t minor -g azure",
        },
        {
            description:
                "Bump dependencies on packages in the server release group to the greatest released version in the client release group. Include pre-release versions.",
            command: "<%= config.bin %> <%= command.id %> server -g client -t greatest -p",
        },
        {
            description:
                "Bump dependencies on server packages to the current version across the repo, replacing any pre-release ranges with release ranges.",
            command: "<%= config.bin %> <%= command.id %> server -t latest",
        },
    ];

    /** An array of messages that will be shown after the command runs. */
    private readonly finalMessages: string[] = [];

    /**
     * Runs the `bump deps` command.
     */
    // eslint-disable-next-line complexity
    public async run(): Promise<void> {
        const args = this.processedArgs;
        const flags = this.processedFlags;

        const context = await this.getContext();
        const shouldInstall = flags.install && !flags.skipChecks;
        const shouldCommit = flags.commit && !flags.skipChecks;

        if (args.package_or_release_group === undefined) {
            this.error("ERROR: No dependency provided.");
        }

        /** The version range or bump type (depending on the CLI arguments) to set. */
        const versionToSet = flags.updateType ?? "current";

        /** A list of package names on which to update dependencies. */
        const depsToUpdate: string[] = [];

        if (isReleaseGroup(args.package_or_release_group)) {
            depsToUpdate.push(
                ...context.packagesInReleaseGroup(args.package_or_release_group).map((p) => p.name),
            );
        } else {
            depsToUpdate.push(args.package_or_release_group);
            const pkg = context.fullPackageMap.get(args.package_or_release_group);
            if (pkg === undefined) {
                this.error(`Package not in context: ${args.package_or_release_group}`);
            }

            if (pkg.monoRepo !== undefined) {
                const rg = pkg.monoRepo.kind;
                this.errorLog(`${pkg.name} is part of the ${rg} release group.`);
                this.errorLog(
                    `If you want to update dependencies on that package, run the following command:\n\n    ${
                        this.config.bin
                    } ${this.id} ${rg} ${this.argv.slice(1).join(" ")}`,
                );
                this.exit(1);
            }
        }

        this.logHr();
        this.log(`Dependencies: ${chalk.blue(args.package_or_release_group)}`);
        this.log(`Packages: ${chalk.blueBright(flags.releaseGroup ?? "all packages")}`);
        this.log(`Prerelease: ${flags.prerelease ? chalk.green("yes") : "no"}`);
        this.log(`Bump type: ${chalk.bold(versionToSet)}`);
        this.logHr();
        this.log("");

        if (!isDependencyUpdateType(flags.updateType) || flags.updateType === undefined) {
            this.error(`Unknown dependency update type: ${flags.updateType}`);
        }

        const { updatedPackages, updatedDependencies } = await npmCheckUpdates(
            context,
            flags.releaseGroup, // if undefined the whole repo will be checked
            depsToUpdate,
            args.package_or_release_group,
            flags.updateType,
            /* prerelease */ flags.prerelease,
            /* writeChanges */ true,
            this.logger,
        );

        if (updatedPackages.length > 0) {
            if (shouldInstall) {
                if (!(await FluidRepo.ensureInstalled(updatedPackages, false))) {
                    this.error("Install failed.");
                }
            } else {
                this.warning(`Skipping installation. Lockfiles might be outdated.`);
            }

            const updatedReleaseGroups: ReleaseGroup[] = [
                ...new Set(
                    updatedPackages
                        .filter((p) => p.monoRepo !== undefined)
                        .map((p) => p.monoRepo!.kind),
                ),
            ];

            const changedVersionsString = [`Updated the following:`, ""];

            for (const rg of updatedReleaseGroups) {
                changedVersionsString.push(indentString(`${rg} (release group)`));
            }

            for (const pkg of updatedPackages) {
                if (pkg.monoRepo === undefined) {
                    changedVersionsString.push(indentString(`${pkg.name}`));
                }
            }

            changedVersionsString.push(
                "",
                `Dependencies on ${chalk.blue(args.package_or_release_group)} updated:`,
                "",
            );

            for (const [pkgName, ver] of Object.entries(updatedDependencies)) {
                changedVersionsString.push(indentString(`${pkgName}: ${chalk.bold(ver)}`));
            }

            const changedVersionMessage = changedVersionsString.join("\n");
            if (shouldCommit) {
                const commitMessage = stripAnsi(`Bump dependencies\n\n${changedVersionMessage}`);

                const bumpBranch = generateBumpDepsBranchName(
                    args.package_or_release_group,
                    flags.updateType,
                    flags.releaseGroup,
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

            this.finalMessages.push(
                `\nUpdated ${depsToUpdate.length} dependencies across ${updatedPackages.length} packages.\n`,
                `${changedVersionMessage}`,
            );
        } else {
            this.log(chalk.red("No dependencies need to be updated."));
        }

        if (this.finalMessages.length > 0) {
            this.logHr();
            for (const msg of this.finalMessages) {
                this.log(msg);
            }
        }
    }
}
