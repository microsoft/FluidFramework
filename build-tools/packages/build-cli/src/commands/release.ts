/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import path from "path";
import {
    bumpVersionScheme,
    detectVersionScheme,
    VersionBumpType,
    VersionScheme,
} from "@fluid-tools/version-tools";
import { exec, FluidRepo, MonoRepo, MonoRepoKind } from "@fluidframework/build-tools";
import chalk from "chalk";
import inquirer from "inquirer";
import { StateMachineCommand } from "../base";
import {
    bumpTypeFlag,
    checkFlags,
    packageSelectorFlag,
    releaseGroupFlag,
    skipCheckFlag,
    versionSchemeFlag,
} from "../flags";
import {
    bumpReleaseGroup,
    difference,
    generateBumpDepsBranchName,
    generateBumpVersionBranchName,
    generateReleaseBranchName,
    getDefaultBumpTypeForBranch,
    getPreReleaseDependencies,
    isReleased,
    npmCheckUpdates,
} from "../lib";
import { StateHandler, UnifiedReleaseMachine } from "../machines";
import { isReleaseGroup, ReleaseGroup, ReleasePackage } from "../releaseGroups";
// eslint-disable-next-line import/no-internal-modules
import { CheckPolicy } from "./check/policy";

interface InstructionalPrompt {
    title: string;
    sections: Section[];
}

interface Section {
    title: string;
    message: string;
    cmd?: string;
}

/**
 * Releases a release group recursively.
 *
 * @remarks
 *
 * First the release group's dependencies are checked. If any of the dependencies are also in the repo, then they're
 * checked for the latest release version. If the dependencies have not yet been released, then the command prompts to
 * perform the release of the dependency, then run the releae command again.
 *
 * This process is continued until all the dependencies have been released, after which the release group itself is
 * released.
 */
export class ReleaseCommand<T extends typeof ReleaseCommand.flags>
    extends StateMachineCommand<T>
    implements StateHandler
{
    machine = UnifiedReleaseMachine.machine;
    releaseGroup: ReleaseGroup | ReleasePackage | undefined;
    versionScheme: VersionScheme | undefined;
    bumpType: VersionBumpType | undefined;
    releaseVersion: string | undefined;
    shouldSkipChecks = false;
    shouldCheckPolicy = true;
    shouldCheckBranch = true;
    shouldCheckBranchUpdate = true;
    shouldCommit = true;
    shouldInstall = true;
    shouldCheckMainNextIntegrated = true;

    static flags = {
        releaseGroup: releaseGroupFlag({
            exclusive: ["package"],
            required: false,
        }),
        package: packageSelectorFlag({
            exclusive: ["releaseGroup"],
            required: false,
        }),
        bumpType: bumpTypeFlag({
            required: false,
        }),
        versionScheme: versionSchemeFlag({
            required: false,
        }),
        skipChecks: skipCheckFlag,
        ...checkFlags,
        ...StateMachineCommand.flags,
    };

    async init() {
        await super.init();

        const context = await this.getContext();
        await this.initMachineHooks();
        const flags = this.processedFlags;

        this.releaseGroup = flags.releaseGroup ?? flags.package!;
        this.releaseVersion = context.getVersion(this.releaseGroup);
        this.bumpType = flags.bumpType as VersionBumpType;
        this.versionScheme = flags.versionScheme as VersionScheme;

        this.shouldSkipChecks = flags.skipChecks;
        this.shouldCheckPolicy = flags.policyCheck && !flags.skipChecks;
        this.shouldCheckBranch = flags.branchCheck && !flags.skipChecks;
        this.shouldCheckMainNextIntegrated = !flags.skipChecks;
        this.shouldCommit = flags.commit && !flags.skipChecks;
        this.shouldInstall = flags.install && !flags.skipChecks;
        this.shouldCheckBranchUpdate = flags.updateCheck && !flags.skipChecks;
    }

    // eslint-disable-next-line complexity
    async handleState(state: string): Promise<boolean> {
        const context = await this.getContext();
        let localHandled = true;

        // First handle any states that we know about. If not handled here, we pass it up to the parent handler.
        switch (state) {
            case "AskReleaseDetails": {
                const currentBranch = await context.gitRepo.getCurrentBranchName();
                const currentVersion = context.getVersion(this.releaseGroup!);
                const bumpedMajor = bumpVersionScheme(currentVersion, "major");
                const bumpedMinor = bumpVersionScheme(currentVersion, "minor");
                const bumpedPatch = bumpVersionScheme(currentVersion, "patch");

                const questions: inquirer.Question[] = [];

                if (this.bumpType === undefined) {
                    const choices = [
                        { value: "major", name: `major (${currentVersion} => ${bumpedMajor})` },
                        { value: "minor", name: `minor (${currentVersion} => ${bumpedMinor})` },
                        { value: "patch", name: `patch  (${currentVersion} => ${bumpedPatch})` },
                    ];
                    this.bumpType = getDefaultBumpTypeForBranch(currentBranch) ?? this.bumpType;
                    const askBumpType: inquirer.ListQuestion = {
                        type: "list",
                        name: "bumpType",
                        choices,
                        default: this.bumpType,
                        message: `The current branch is '${currentBranch}'. The default bump type for that branch is '${this.bumpType}', but you can change it now if needed.`,
                    };
                    questions.push(askBumpType);
                    const answers = await inquirer.prompt(questions);
                    this.bumpType = answers.bumpType;
                }

                this.logHr();
                this.log(`RELEASE PLAN\n`);
                this.log(`Release group: ${this.releaseGroup}`);
                this.log(`Version to be released: ${chalk.greenBright(currentVersion)}`);
                this.log(`Bump type: ${this.bumpType}`);
                this.log(
                    `Version after bump: ${bumpVersionScheme(currentVersion, this.bumpType!)}`,
                );

                this.machine.action("success");
                break;
            }

            case "DoChecks": {
                this.machine.action("success");
                break;
            }

            case "CheckShouldRunOptionalChecks": {
                if (this.shouldSkipChecks) {
                    this.machine.action("failure");
                }

                this.machine.action("success");
                break;
            }

            case "CheckValidReleaseGroup": {
                if (isReleaseGroup(this.releaseGroup)) {
                    this.machine.action("success");
                    // eslint-disable-next-line no-negated-condition
                } else if (context.fullPackageMap.get(this.releaseGroup!) !== undefined) {
                    this.machine.action("success");
                } else {
                    this.machine.action("failure");
                }

                break;
            }

            case "CheckPolicy": {
                if (this.shouldCheckPolicy) {
                    if (context.originalBranchName !== "main") {
                        this.warn(
                            "WARNING: Policy check fixes are not expected outside of main branch!  Make sure you know what you are doing.",
                        );
                    }

                    // TODO: Call new check policy command
                    // await CheckPolicy.run(["--fix", "--exclusions",
                    // "build-tools/packages/build-tools/data/exclusions.json"]);
                    const r = await exec(
                        `node ${path.join(
                            context.gitRepo.resolvedRoot,
                            "build-tools",
                            "packages",
                            "build-tools",
                            "dist",
                            "repoPolicyCheck",
                            "repoPolicyCheck.js",
                        )} -r`,
                        context.gitRepo.resolvedRoot,
                        "policy-check:fix failed",
                    );

                    // check for policy check violation
                    const afterPolicyCheckStatus = await context.gitRepo.getStatus();
                    if (afterPolicyCheckStatus !== "" && afterPolicyCheckStatus !== "") {
                        this.logHr();
                        this.errorLog(
                            `Policy check needed to make modifications. Please create PR for the changes and merge before retrying.\n${afterPolicyCheckStatus}`,
                        );
                        this.machine.action("failure");
                        break;
                    }
                } else {
                    this.warn("Skipping policy check.");
                }

                this.machine.action("success");
                break;
            }

            case "CheckHasRemote": {
                const remote = await context.gitRepo.getRemote(context.originRemotePartialUrl);
                if (remote === undefined) {
                    this.machine.action("failure");
                    this.errorLog(`Unable to find remote for '${context.originRemotePartialUrl}'`);
                }

                this.machine.action("success");
                break;
            }

            case "CheckBranchUpToDate": {
                const remote = await context.gitRepo.getRemote(context.originRemotePartialUrl);
                const isBranchUpToDate = await context.gitRepo.isBranchUpToDate(
                    context.originalBranchName,
                    remote!,
                );
                if (this.shouldCheckBranchUpdate) {
                    if (!isBranchUpToDate) {
                        this.machine.action("failure");
                        this.errorLog(
                            `Local '${context.originalBranchName}' branch not up to date with remote. Please pull from '${remote}'.`,
                        );
                    }

                    this.machine.action("success");
                } else {
                    this.warn("Not checking if the branch is up-to-date with the remote.");
                    this.machine.action("success");
                }

                break;
            }

            case "CheckNoPrereleaseDependencies3":
            case "CheckNoPrereleaseDependencies2":
            case "CheckNoPrereleaseDependencies": {
                const { releaseGroups, packages, isEmpty } = await getPreReleaseDependencies(
                    context,
                    this.releaseGroup!,
                );

                // assert(!isEmpty, `No prereleases found in ${state} state.`);

                const packagesToBump = new Set(packages.keys());
                for (const rg of releaseGroups.keys()) {
                    for (const p of context.packagesInReleaseGroup(rg)) {
                        packagesToBump.add(p.name);
                    }
                }

                if (isEmpty) {
                    this.machine.action("success");
                } else {
                    this.machine.action("failure");
                }

                break;
            }

            case "CheckForReleaseType": {
                if (this.bumpType === undefined) {
                    throw new Error(`bumpType is undefined.`);
                }

                this.machine.action(this.bumpType);
                break;
            }

            case "DoPatchRelease":
            case "DoMinorRelease":
            case "DoMajorRelease": {
                if (this.bumpType === undefined) {
                    this.machine.action("failure");
                }

                this.machine.action("success");
                break;
            }

            case "CheckBranchName": {
                if (this.shouldCheckBranch) {
                    switch (this.bumpType) {
                        case "patch": {
                            this.verbose(
                                `Checking if ${context.originalBranchName} starts with release/`,
                            );
                            if (!context.originalBranchName.startsWith("release/")) {
                                this.warn(
                                    `Patch release should only be done on 'release/*' branches, but current branch is '${context.originalBranchName}'.\nYou can skip this check with --no-branchCheck.'`,
                                );
                                this.machine.action("failure");
                                this.exit();
                            }

                            break;
                        }

                        case "major":
                        case "minor": {
                            this.verbose(
                                `Checking if ${context.originalBranchName} is 'main', 'next', or 'lts'.`,
                            );
                            if (!["main", "next", "lts"].includes(context.originalBranchName)) {
                                this.warn(
                                    `Release prep should only be done on 'main', 'next', or 'lts' branches, but current branch is '${context.originalBranchName}'.`,
                                );
                                this.machine.action("failure");
                                this.exit();
                            }
                        }
                    }
                } else {
                    this.warn(
                        `Not checking if current branch is a release branch: ${context.originalBranchName}`,
                    );
                }

                this.machine.action("success");
                break;
            }

            case "CheckInstallBuildTools": {
                const installQuestion: inquirer.ConfirmQuestion = {
                    type: "confirm",
                    name: "install",
                    message: `Do you want to install the Fluid build-tools? You don't need to do this if you installed them globally.`,
                };

                const answer = await inquirer.prompt(installQuestion);
                if (answer.install === true) {
                    this.log(`Installing build-tools so we can run build:genver`);
                    const buildToolsMonoRepo = context.repo.releaseGroups.get(
                        MonoRepoKind.BuildTools,
                    )!;
                    const ret = await buildToolsMonoRepo.install();
                    if (ret.error) {
                        this.errorLog("Install failed.");
                        this.machine.action("failure");
                    }
                } else {
                    this.warn(`Skipping installation.`);
                }

                this.machine.action("success");
                break;
            }

            case "CheckMainNextIntegrated": {
                // TODO: Implement this
                if (this.bumpType === "major") {
                    if (this.shouldCheckMainNextIntegrated) {
                        this.warn(
                            chalk.red(`Automated main/next integration check not yet implemented.`),
                        );
                        this.warn(
                            `Make sure next has been integrated into main before continuing.`,
                        );

                        const confirmIntegratedQuestion: inquirer.ConfirmQuestion = {
                            type: "confirm",
                            name: "integrated",
                            message: `Has next has been integrated into main?`,
                        };

                        const answers = await inquirer.prompt(confirmIntegratedQuestion);
                        if (answers.integrated !== true) {
                            this.machine.action("failed");
                        }
                    } else {
                        this.warn("Skipping main/next integration check.");
                    }
                }

                this.machine.action("success");
                break;
            }

            case "CheckReleaseIsDone": {
                const wasReleased = await isReleased(
                    context,
                    this.releaseGroup!,
                    this.releaseVersion!,
                );
                if (wasReleased) {
                    this.machine.action("success");
                } else {
                    this.machine.action("failure");
                }

                break;
            }

            case "CheckReleaseGroupIsNotBumped": {
                const rgVersion = context.getVersion(this.releaseGroup!);
                if (rgVersion === this.releaseVersion) {
                    this.machine.action("success");
                    break;
                }

                this.warn(
                    `Release group ${this.releaseGroup} has already been bumped. It is at version ${rgVersion}; current released version ${this.releaseVersion}`,
                );
                this.machine.action("failure");
                break;
            }

            case "DoReleaseGroupBump": {
                const rgRepo = isReleaseGroup(this.releaseGroup)
                    ? context.repo.releaseGroups.get(this.releaseGroup)!
                    : context.fullPackageMap.get(this.releaseGroup!)!;
                const scheme = detectVersionScheme(this.releaseVersion!);
                const newVersion = bumpVersionScheme(this.releaseVersion, this.bumpType!, scheme);
                const packages = rgRepo instanceof MonoRepo ? rgRepo.packages : [rgRepo];

                this.log(
                    `Version ${this.releaseVersion} of ${
                        this.releaseGroup
                    } already released, so we can bump to ${newVersion} (${chalk.blue(
                        this.bumpType!,
                    )} bump)!`,
                );

                const bumpResults = await bumpReleaseGroup(context, this.bumpType!, rgRepo, scheme);
                this.verbose(`Raw bump results:`);
                this.verbose(bumpResults);

                if (this.shouldInstall && !(await FluidRepo.ensureInstalled(packages, false))) {
                    this.errorLog("Install failed.");
                    this.machine.action("failure");
                }

                this.machine.action("success");
                break;
            }

            case "PromptToIntegrateNext": {
                const prompt: InstructionalPrompt = {
                    title: "NEED TO INTEGRATE MAIN AND NEXT BRANCHES",
                    sections: [
                        {
                            title: "DETAILS",
                            message: `The 'next' branch has not been integrated into the '${context.originalBranchName}' branch.`,
                        },
                        {
                            title: "NEXT",
                            message: `Merge 'next' into the '${context.originalBranchName}' branch, then run the release command again:`,
                        },
                    ],
                };

                await this.writePrompt(prompt);
                this.exit();
                break;
            }

            case "PromptToRelease": {
                const flag = isReleaseGroup(this.releaseGroup) ? "-g" : "-p";
                await this.writePrompt({
                    title: `READY TO RELEASE version ${chalk.bold(this.releaseVersion!)}!`,
                    sections: [
                        {
                            title: "FIRST",
                            message: `Queue a ${chalk.green(
                                chalk.bold("release"),
                            )} build for the following release group in ADO for branch ${chalk.blue(
                                chalk.bold(context.originalBranchName),
                            )}:\n\n    ${chalk.green(chalk.bold(this.releaseGroup!))}`,
                        },
                        {
                            title: "NEXT",
                            message: `After the build is done and the release group has been published, run the following command to bump the release group to the next version and update dependencies on the newly released package(s):`,
                            cmd: `${this.config.bin} ${this.id} ${flag} ${this.releaseGroup}`,
                        },
                    ],
                });
                this.exit();
                break;
            }

            case "DoBumpReleasedDependencies": {
                const { releaseGroups, packages, isEmpty } = await getPreReleaseDependencies(
                    context,
                    this.releaseGroup!,
                );

                assert(!isEmpty, `No prereleases found in DoBumpReleasedDependencies state.`);

                const packagesToBump = new Set(packages.keys());
                for (const rg of releaseGroups.keys()) {
                    for (const p of context.packagesInReleaseGroup(rg)) {
                        packagesToBump.add(p.name);
                    }
                }

                // First, check if any prereleases have released versions on npm
                let { updatedPackages, updatedDependencies } = await npmCheckUpdates(
                    context,
                    this.releaseGroup!,
                    [...packagesToBump],
                    "current",
                    /* prerelease */ true,
                    /* writeChanges */ false,
                    this.logger,
                );

                // Divide the updated dependencies into individual packages and release groups
                const updatedReleaseGroups = new Set<string>();
                const updatedDeps = new Set<string>();
                for (const p of updatedDependencies) {
                    if (p.monoRepo === undefined) {
                        updatedDeps.add(p.name);
                    } else {
                        updatedReleaseGroups.add(p.monoRepo.kind);
                    }
                }

                const remainingReleaseGroupsToBump = difference(
                    new Set(releaseGroups.keys()),
                    updatedReleaseGroups,
                );
                const remainingPackagesToBump = difference(new Set(packages.keys()), updatedDeps);

                if (remainingReleaseGroupsToBump.size === 0 && remainingPackagesToBump.size === 0) {
                    // This is the same command as run above, but this time we write the changes. THere are more
                    // efficient ways to do this but this is simple.
                    ({ updatedPackages, updatedDependencies } = await npmCheckUpdates(
                        context,
                        this.releaseGroup!,
                        [...packagesToBump],
                        "current",
                        /* prerelease */ true,
                        /* writeChanges */ true,
                    ));
                }

                if (updatedPackages.length > 0) {
                    // There were updates, which is considered a failure.
                    this.machine.action("failure");
                    context.repo.reload();
                    break;
                }

                this.machine.action("success");
                break;
            }

            case "CheckReleaseBranchDoesNotExist": {
                assert(
                    isReleaseGroup(this.releaseGroup),
                    `Not a release group: ${this.releaseGroup}`,
                );

                const releaseBranch = generateReleaseBranchName(
                    this.releaseGroup,
                    this.releaseVersion!,
                );

                const commit = await context.gitRepo.getShaForBranch(releaseBranch);
                if (commit !== undefined) {
                    this.machine.action("failure");
                    this.errorLog(`${releaseBranch} already exists`);
                }

                this.machine.action("success");
                break;
            }

            case "PromptToPRDeps": {
                await this.writePrompt({
                    title: "NEED TO UPDATE DEPENDENCIES",
                    sections: [
                        {
                            title: "FIRST",
                            message: `Push and create a PR for branch ${await context.gitRepo.getCurrentBranchName()} targeting the ${
                                context.originalBranchName
                            } branch.`,
                        },
                        {
                            title: "NEXT",
                            message: `After the PR is merged, run the following command to continue the release:`,
                            cmd: `${this.config.bin} ${this.id} -g ${this.releaseGroup}`,
                        },
                    ],
                });

                this.exit();
                break;
            }

            case "PromptToPRBump": {
                const bumpBranch = await context.gitRepo.getCurrentBranchName();
                const prompt: InstructionalPrompt = {
                    title: "NEED TO BUMP TO THE NEXT VERSION",
                    sections: [
                        {
                            title: "FIRST",
                            message: `Push and create a PR for branch ${bumpBranch} targeting the ${context.originalBranchName} branch.`,
                        },
                    ],
                };

                if (isReleaseGroup(this.releaseGroup)) {
                    const releaseBranch = generateReleaseBranchName(
                        this.releaseGroup,
                        this.releaseVersion!,
                    );

                    const releaseBranchExists =
                        (await context.gitRepo.getShaForBranch(releaseBranch)) !== undefined;

                    if (!releaseBranchExists) {
                        prompt.sections.push({
                            title: "NEXT",
                            message: `After PR is merged, create branch '${releaseBranch}' one commit before the merged PR and push to the repo.\n\nOnce the release branch has been created, switch to it and use the following command to release the ${this.releaseGroup} release group:`,
                            cmd: `${this.config.bin} ${this.id} -g ${this.releaseGroup}`,
                        });
                    }
                }

                await this.writePrompt(prompt);
                this.exit();
                break;
            }

            case "CheckShouldCommitBump":
            case "CheckShouldCommitDeps": {
                if (!this.shouldCommit) {
                    this.machine.action("failure");
                    break;
                }

                const version = this.releaseVersion;
                const newVersion = bumpVersionScheme(version, this.bumpType!);

                const branchName = generateBumpVersionBranchName(
                    this.releaseGroup!,
                    this.bumpType!,
                    this.releaseVersion!,
                );

                await context.createBranch(branchName);

                this.verbose(`Created bump branch: ${branchName}`);

                const commitMsg = `[bump] ${this.releaseGroup}: ${version} => ${newVersion} (${this.bumpType})\n\nPost-release ${this.bumpType} bump of ${this.releaseGroup}.`;
                await context.gitRepo.commit(commitMsg, `Error committing to ${branchName}`);
                this.machine.action("success");
                break;
            }

            case "CheckShouldCommitReleasedDepsBump": {
                if (!this.shouldCommit) {
                    this.machine.action("success");
                }

                assert(isReleaseGroup(this.releaseGroup));
                const branchName = generateBumpDepsBranchName(this.releaseGroup, "releasedDeps");
                await context.gitRepo.createBranch(branchName);

                this.verbose(`Created bump branch: ${branchName}`);
                this.log(
                    `BUMP: ${this.releaseGroup}: Bumped prerelease dependencies to release versions.`,
                );

                const commitMsg = `[bump] ${this.releaseGroup}: update prerelease dependencies to release versions`;
                await context.gitRepo.commit(commitMsg, `Error committing to ${branchName}`);
                this.machine.action("success");
                break;
            }

            case "PromptToCommitBump": {
                const prompt: InstructionalPrompt = {
                    title: "NEED TO COMMIT LOCAL CHANGES",
                    sections: [
                        {
                            title: "FIRST",
                            message: `Commit the local changes and create a PR targeting the ${context.originalBranchName} branch.\n\nAfter the PR is merged, then the release of ${this.releaseGroup} is complete!`,
                        },
                    ],
                };
                await this.writePrompt(prompt);
                this.exit();
                break;
            }

            case "PromptToCommitDeps":
            case "PromptToCommitReleasedDepsBump": {
                const prompt: InstructionalPrompt = {
                    title: "NEED TO COMMIT LOCAL CHANGES",
                    sections: [
                        {
                            title: "FIRST",
                            message: `Commit the local changes and create a PR targeting the ${context.originalBranchName} branch.\n\nAfter the PR is merged, then the release of ${this.releaseGroup} is complete!`,
                        },
                    ],
                };
                await this.writePrompt(prompt);
                this.exit();
                break;
            }

            case "PromptToReleaseDeps": {
                const prereleaseDepNames = await getPreReleaseDependencies(
                    context,
                    this.releaseGroup!,
                );

                const prompt: InstructionalPrompt = {
                    title: "NEED TO RELEASE DEPENDENCIES",
                    sections: [
                        {
                            title: "DETAILS",
                            message: chalk.red(
                                `\nCan't release the ${this.releaseGroup} release group because some of its dependencies need to be released first.`,
                            ),
                        },
                    ],
                };

                if (
                    prereleaseDepNames.releaseGroups.size > 0 ||
                    prereleaseDepNames.packages.size > 0
                ) {
                    if (prereleaseDepNames.packages.size > 0) {
                        let packageSection = "";
                        for (const [pkg, depVersion] of prereleaseDepNames.packages.entries()) {
                            packageSection += `${pkg} = ${depVersion}`;
                        }

                        prompt.sections.push({
                            title: "FIRST",
                            message: `Release these packages first:\n\n${chalk.blue(
                                packageSection,
                            )}`,
                        });
                    }

                    if (prereleaseDepNames.releaseGroups.size > 0) {
                        let packageSection = "";
                        for (const [rg, depVersion] of prereleaseDepNames.releaseGroups.entries()) {
                            packageSection += `${rg} = ${depVersion}`;
                        }

                        prompt.sections.push({
                            title: "NEXT",
                            message: `Release these release groups:\n\n${chalk.blue(
                                packageSection,
                            )}`,
                        });
                    }
                }

                await this.writePrompt(prompt);
                this.exit();
                break;
            }

            case "PromptToPRReleasedDepsBump": {
                this.errorLog(`Not yet implemented`);
                this.exit();
                break;
            }

            default: {
                localHandled = false;
            }
        }

        if (localHandled) {
            return true;
        }

        const superHandled = await super.handleState(state);
        return superHandled;
    }

    async writePrompt(data: InstructionalPrompt) {
        this.logHr();
        this.log();
        this.log(chalk.green(chalk.underline(data.title)));
        this.log();
        for (const section of data.sections) {
            this.log(chalk.white(chalk.underline(`${section.title}:`)));
            this.log();
            this.logIndent(section.message);
            this.log();
            if (section.cmd !== undefined) {
                this.logIndent(chalk.cyan(`${section.cmd}`), 4);
                this.log();
            }
        }
    }
}
