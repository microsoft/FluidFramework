/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidRepo, isMonoRepoKind, VersionBag } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
// eslint-disable-next-line import/no-internal-modules
import { ArgInput } from "@oclif/core/lib/interfaces";
import chalk from "chalk";
import * as semver from "semver";
import { BaseCommand } from "../../base";
import { bumpTypeFlag, releaseGroupFlag, semverRangeFlag } from "../../flags";
import { bumpPackageDependencies, PackageWithRangeSpec } from "../../lib";

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
        version: semverRangeFlag({
            char: "n",
            exclusive: ["bumpType"],
        }),
        bumpType: bumpTypeFlag({
            char: "t",
            description: "Bump the current version of the dependency according to this bump type.",
            exclusive: ["version"],
        }),
        prerelease: Flags.boolean({
            char: "p",
            dependsOn: ["bumpType"],
            description: "Bump to pre-release versions.",
            exclusive: ["version"],
        }),
        onlyBumpPrerelease: Flags.boolean({
            description: "Only bump dependencies that are on pre-release versions.",
        }),
        releaseGroup: releaseGroupFlag({
            description: "Only bump dependencies within this release group.",
        }),
        commit: Flags.boolean({
            allowNo: true,
            default: true,
            description: "Commit changes to a new branch.",
        }),
        install: Flags.boolean({
            allowNo: true,
            default: true,
            description: "Update lockfiles by running 'npm install' automatically.",
        }),
        skipChecks: Flags.boolean({
            char: "x",
            default: false,
            description: "Skip all checks.",
            exclusive: ["install", "commit"],
        }),
        ...BaseCommand.flags,
    };

    static examples = [
        {
            description:
                "Bump dependencies on @fluidframework/build-common to range ~1.2.0 across all release groups.",
            command: "<%= config.bin %> <%= command.id %> @fluidframework/build-common -n '~1.2.0'",
        },
        {
            description:
                "Bump dependencies on @fluidframework/build-common to range ^1.0.0-0 in the azure release group.",
            command:
                "<%= config.bin %> <%= command.id %> @fluidframework/build-common -n '^1.0.0-0' -g azure",
        },
        {
            description:
                "Bump dependencies on packages in the server release group to the next major prerelease in the client release group.",
            command: "<%= config.bin %> <%= command.id %> server -g client -t major",
        },
        {
            description:
                "Bump dependencies on server packages to the current version, replacing any pre-release ranges with release ranges.",
            command: "<%= config.bin %> <%= command.id %> server -g client -t current",
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

        if (flags.bumpType === undefined && semver.validRange(flags.version) === null) {
            this.error(`ERROR: Invalid version range: ${flags.version}`);
        }

        /** The version range or bump type (depending on the CLI arguments) to set. */
        const versionToSet =
            flags.version !== undefined && flags.version !== ""
                ? flags.version
                : flags.bumpType ?? "patch";

        /** A map of package names to version OR bump type strings. */
        const packagesToBump = new Map<string, string | undefined>();

        if (isMonoRepoKind(args.package_or_release_group)) {
            // if the package argument is a release group name, then constrain the list of packages to those in the
            // release group.
            for (const pkg of context.packagesInReleaseGroup(args.package_or_release_group)) {
                packagesToBump.set(pkg.name, versionToSet);
            }
        } else {
            // We must be bumping a single package.
            packagesToBump.set(args.package_or_release_group, versionToSet);
        }

        this.log(`Dependencies: ${chalk.blue(args.package_or_release_group)}`);
        this.log(`Packages: ${chalk.blueBright(flags.releaseGroup ?? "all packages")}`);
        this.log(`Prerelease: ${flags.prerelease ? chalk.green("yes") : "no"}`);
        this.log(`Bump type: ${chalk.bold(flags.bumpType ?? `${flags.version} (exact version)`)}`);
        this.log("");

        /** An array of packages on which to enumerate and update dependencies. */
        const packagesToCheckAndUpdate = isMonoRepoKind(flags.releaseGroup)
            ? context.packagesInReleaseGroup(flags.releaseGroup)
            : context.repo.packages.packages;

        /** A Map of package name strings to {@link PackageWithRangeSpec} that contains a {@link Package} and the
         *  desired version range that should be set.
         */
        const packageNewVersionMap = new Map(
            [...packagesToBump.entries()].map((entry) => {
                const [pkgName, versionOrBump] = entry;
                const pkg = context.fullPackageMap.get(pkgName);
                if (pkg === undefined) {
                    this.error(`No entry for ${pkgName} in fullPackageMap.`);
                }

                if (versionOrBump === undefined) {
                    this.error(`versionOrBump cannot be undefined.`);
                }

                const rangeSpec: PackageWithRangeSpec = { pkg, rangeOrBumpType: versionOrBump };
                return [pkg.name, rangeSpec];
            }),
        );

        const changedPackages = new VersionBag();
        for (const pkg of packagesToCheckAndUpdate) {
            // eslint-disable-next-line no-await-in-loop
            await bumpPackageDependencies(
                pkg,
                packageNewVersionMap,
                flags.prerelease,
                flags.onlyBumpPrerelease,
                changedPackages,
            );
        }

        if (changedPackages.size > 0) {
            if (shouldInstall) {
                if (!(await FluidRepo.ensureInstalled(packagesToCheckAndUpdate, false))) {
                    this.error("Install failed.");
                }
            } else {
                this.warn(`Skipping installation. Lockfiles might be outdated.`);
            }

            const changedVersionsString: string[] = [];
            for (const [name, version] of changedPackages) {
                const newName = isMonoRepoKind(name) ? `${name} (release group)` : name;
                changedVersionsString.push(`${newName.padStart(40)} -> ${version}`);
            }

            const changedVersionMessage = changedVersionsString.join("\n");
            if (shouldCommit) {
                const commitMessage = `Bump dependencies\n\n${changedVersionMessage}`;
                const bumpBranch = `dep_${Date.now()}`;
                this.log(`Creating branch ${bumpBranch}`);
                await context.createBranch(bumpBranch);
                await context.gitRepo.commit(commitMessage, "Error committing");
                this.finalMessages.push(
                    `You can now create a PR for branch ${bumpBranch} targeting ${context.originalBranchName}`,
                );
            } else {
                this.warn(`Skipping commit. You'll need to manually commit changes.`);
            }

            this.finalMessages.push(
                `\nUpdated ${packagesToBump.size} dependencies across ${packagesToCheckAndUpdate.length} packages.\n`,
                `${changedVersionMessage}`,
            );
        } else {
            console.log(chalk.red("No dependencies need to be updated."));
        }

        if (this.finalMessages.length > 0) {
            this.logHr();
            for (const msg of this.finalMessages) {
                this.log(msg);
            }
        }
    }
}
