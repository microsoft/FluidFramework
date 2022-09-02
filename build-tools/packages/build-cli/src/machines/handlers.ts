import { strict as assert } from "assert";
import path from "path";
import {
    bumpVersionScheme,
    detectVersionScheme,
    VersionBumpType,
    VersionScheme,
} from "@fluid-tools/version-tools";
import { Context, exec, FluidRepo, MonoRepo, MonoRepoKind } from "@fluidframework/build-tools";
import { Command } from "@oclif/core";
import chalk from "chalk";
import inquirer from "inquirer";
import type { Machine } from "jssm";
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
import { CommandLogger } from "../logging";
import { isReleaseGroup, ReleaseGroup, ReleasePackage } from "../releaseGroups";
// eslint-disable-next-line import/no-internal-modules
import { CheckPolicy } from "../commands/check/policy";
import { StateHandler } from "./types";

interface InstructionalPrompt {
    title: string;
    sections: Section[];
}

interface Section {
    title: string;
    message: string;
    cmd?: string;
}

export interface HandlerData {
    releaseGroup?: ReleaseGroup | ReleasePackage;
    versionScheme?: VersionScheme;
    bumpType?: VersionBumpType;
    releaseVersion?: string;
    shouldSkipChecks?: boolean;
    shouldCheckPolicy?: boolean;
    shouldCheckBranch?: boolean;
    shouldCheckBranchUpdate?: boolean;
    shouldCommit?: boolean;
    shouldInstall?: boolean;
    shouldCheckMainNextIntegrated?: boolean;
    command?: Command;
}

export abstract class StateHandlerImpl implements StateHandler {
    // eslint-disable-next-line no-useless-constructor
    public constructor(
        // protected readonly context: Context,
        protected readonly machine: Machine<unknown>,
        protected readonly log: CommandLogger, // public readonly testMode: boolean,
    ) { }

    // eslint-disable-next-line max-params
    async handleState(
        context: Context,
        state: string,
        machine: Machine<unknown>,
        testMode: boolean,
        log: CommandLogger,
        data: unknown,
    ): Promise<boolean> {
        switch (state) {
            case "Init": {
                if (testMode) {
                    return true;
                }

                this.signalSuccess(state);
                break;
            }

            case "Failed": {
                if (testMode) {
                    return true;
                }

                throw new Error(`Entered final state: ${state}`);
                break;
            }

            default: {
                return false;
            }
        }

        return true;
    }

    protected signalSuccess(state: string) {
        const transitioned = this.machine.action("success");
        if (!transitioned) {
            throw new Error(`Failed when signaling success from state: ${state}`);
        }
    }

    protected signalFailure(state: string) {
        const transitioned = this.machine.action("failure");
        if (!transitioned) {
            throw new Error(`Failed when signaling failure from state: ${state}`);
        }
    }

    protected async writePrompt(data: InstructionalPrompt) {
        this.log.logHr();
        this.log.info("");
        this.log.info(chalk.green(chalk.underline(data.title)));
        this.log.info("");
        for (const section of data.sections) {
            this.log.info(chalk.white(chalk.underline(`${section.title}:`)));
            this.log.info("");
            this.log.logIndent(section.message, 4);
            this.log.info("");
            if (section.cmd !== undefined) {
                this.log.logIndent(chalk.cyan(`${section.cmd}`), 4);
                this.log.info("");
            }
        }
    }
}

export class UnifiedReleaseHandler extends StateHandlerImpl {
    // eslint-disable-next-line complexity, max-params
    async handleState(
        context: Context,
        state: string,
        machine: Machine<unknown>,
        testMode: boolean,
        log: CommandLogger,
        data: HandlerData,
    ): Promise<boolean> {
        let superShouldHandle = false;
        switch (state) {
            case "AskForReleaseType": {
                if (testMode) return true;

                const { bumpType: inputBumpType, releaseGroup } = data;

                const currentBranch = await context.gitRepo.getCurrentBranchName();
                const currentVersion = context.getVersion(releaseGroup!);
                const bumpedMajor = bumpVersionScheme(currentVersion, "major");
                const bumpedMinor = bumpVersionScheme(currentVersion, "minor");
                const bumpedPatch = bumpVersionScheme(currentVersion, "patch");

                const questions: inquirer.Question[] = [];

                let bumpType = getDefaultBumpTypeForBranch(currentBranch) ?? inputBumpType;
                if (inputBumpType === undefined) {
                    const choices = [
                        { value: "major", name: `major (${currentVersion} => ${bumpedMajor})` },
                        { value: "minor", name: `minor (${currentVersion} => ${bumpedMinor})` },
                        { value: "patch", name: `patch  (${currentVersion} => ${bumpedPatch})` },
                    ];
                    const askBumpType: inquirer.ListQuestion = {
                        type: "list",
                        name: "bumpType",
                        choices,
                        default: bumpType,
                        message: `The current branch is '${currentBranch}'. The default bump type for that branch is '${bumpType}', but you can change it now if needed.`,
                    };
                    questions.push(askBumpType);
                    const answers = await inquirer.prompt(questions);
                    bumpType = answers.bumpType;
                    data.bumpType = bumpType;
                }

                if (bumpType === undefined) {
                    throw new Error(`bumpType is undefined.`);
                }

                // This state is unique; it uses major/minor/patch as the actions
                this.machine.action(bumpType);

                this.signalSuccess(state);
                break;
            }

            case "DoChecks": {
                if (testMode) return true;

                this.signalSuccess(state);
                break;
            }

            case "CheckShouldRunOptionalChecks": {
                if (testMode) return true;

                const { shouldSkipChecks } = data;
                if (shouldSkipChecks === true) {
                    this.signalFailure(state);
                }

                this.signalSuccess(state);
                break;
            }

            case "CheckValidReleaseGroup": {
                if (testMode) return true;

                const { releaseGroup } = data;
                if (isReleaseGroup(releaseGroup)) {
                    this.signalSuccess(state);
                    // eslint-disable-next-line no-negated-condition
                } else if (context.fullPackageMap.get(releaseGroup!) !== undefined) {
                    this.signalSuccess(state);
                } else {
                    this.signalFailure(state);
                }

                break;
            }

            case "CheckPolicy": {
                if (testMode) return true;

                const { shouldCheckPolicy } = data;
                if (shouldCheckPolicy === true) {
                    if (context.originalBranchName !== "main") {
                        log.warning(
                            "WARNING: Policy check fixes are not expected outside of main branch!  Make sure you know what you are doing.",
                        );
                    }

                    await CheckPolicy.run([
                        "--fix",
                        "--exclusions",
                        path.join(
                            context.gitRepo.resolvedRoot,
                            "build-tools",
                            "packages",
                            "build-tools",
                            "data",
                            "exclusions.json"
                        )
                    ]);
                    // const r = await exec(
                    //     `node ${path.join(
                    //         context.gitRepo.resolvedRoot,
                    //         "build-tools",
                    //         "packages",
                    //         "build-tools",
                    //         "dist",
                    //         "repoPolicyCheck",
                    //         "repoPolicyCheck.js",
                    //     )} -r`,
                    //     context.gitRepo.resolvedRoot,
                    //     "policy-check:fix failed",
                    // );

                    // check for policy check violation
                    const afterPolicyCheckStatus = await context.gitRepo.getStatus();
                    if (afterPolicyCheckStatus !== "" && afterPolicyCheckStatus !== "") {
                        log.logHr();
                        log.errorLog(
                            `Policy check needed to make modifications. Please create PR for the changes and merge before retrying.\n${afterPolicyCheckStatus}`,
                        );
                        this.signalFailure(state);
                        break;
                    }
                } else {
                    log.warning("Skipping policy check.");
                }

                this.signalSuccess(state);
                break;
            }

            case "CheckHasRemote": {
                if (testMode) return true;

                const remote = await context.gitRepo.getRemote(context.originRemotePartialUrl);
                if (remote === undefined) {
                    this.signalFailure(state);
                    log.errorLog(`Unable to find remote for '${context.originRemotePartialUrl}'`);
                }

                this.signalSuccess(state);
                break;
            }

            case "CheckBranchUpToDate": {
                if (testMode) return true;

                const { shouldCheckBranchUpdate } = data;
                const remote = await context.gitRepo.getRemote(context.originRemotePartialUrl);
                const isBranchUpToDate = await context.gitRepo.isBranchUpToDate(
                    context.originalBranchName,
                    remote!,
                );
                if (shouldCheckBranchUpdate === true) {
                    if (!isBranchUpToDate) {
                        this.signalFailure(state);
                        log.errorLog(
                            `Local '${context.originalBranchName}' branch not up to date with remote. Please pull from '${remote}'.`,
                        );
                    }

                    this.signalSuccess(state);
                } else {
                    log.warning("Not checking if the branch is up-to-date with the remote.");
                    this.signalSuccess(state);
                }

                break;
            }

            case "CheckNoPrereleaseDependencies3":
            case "CheckNoPrereleaseDependencies2":
            case "CheckNoPrereleaseDependencies": {
                if (testMode) return true;

                const { releaseGroup } = data;

                const { releaseGroups, packages, isEmpty } = await getPreReleaseDependencies(
                    context,
                    releaseGroup!,
                );

                // assert(!isEmpty, `No prereleases found in ${state} state.`);

                const packagesToBump = new Set(packages.keys());
                for (const rg of releaseGroups.keys()) {
                    for (const p of context.packagesInReleaseGroup(rg)) {
                        packagesToBump.add(p.name);
                    }
                }

                if (isEmpty) {
                    this.signalSuccess(state);
                } else {
                    this.signalFailure(state);
                }

                break;
            }

            case "DoPatchRelease":
            case "DoMinorRelease":
            case "DoMajorRelease": {
                if (testMode) return true;

                const { bumpType } = data;

                if (bumpType === undefined) {
                    this.signalFailure(state);
                }

                this.signalSuccess(state);
                break;
            }

            case "CheckBranchName":
            case "CheckBranchName2":
            case "CheckBranchName3": {
                if (testMode) return true;

                const { bumpType, shouldCheckBranch } = data;

                if (shouldCheckBranch === true) {
                    switch (bumpType) {
                        case "patch": {
                            log.verbose(
                                `Checking if ${context.originalBranchName} starts with release/`,
                            );
                            if (!context.originalBranchName.startsWith("release/")) {
                                log.warning(
                                    `Patch release should only be done on 'release/*' branches, but current branch is '${context.originalBranchName}'.\nYou can skip this check with --no-branchCheck.'`,
                                );
                                this.signalFailure(state);
                            }

                            break;
                        }

                        case "major":
                        case "minor": {
                            log.verbose(
                                `Checking if ${context.originalBranchName} is 'main', 'next', or 'lts'.`,
                            );
                            if (!["main", "next", "lts"].includes(context.originalBranchName)) {
                                log.warning(
                                    `Release prep should only be done on 'main', 'next', or 'lts' branches, but current branch is '${context.originalBranchName}'.`,
                                );
                                this.signalFailure(state);
                            }
                        }
                    }
                } else {
                    log.warning(
                        `Not checking if current branch is a release branch: ${context.originalBranchName}`,
                    );
                }

                this.signalSuccess(state);
                break;
            }

            case "CheckInstallBuildTools": {
                if (testMode) return true;

                const installQuestion: inquirer.ConfirmQuestion = {
                    type: "confirm",
                    name: "install",
                    message: `Do you want to install the Fluid build-tools? You don't need to do this if you installed them globally.`,
                };

                const answer = await inquirer.prompt(installQuestion);
                if (answer.install === true) {
                    log.info(`Installing build-tools so we can run build:genver`);
                    const buildToolsMonoRepo = context.repo.releaseGroups.get(
                        MonoRepoKind.BuildTools,
                    )!;
                    const ret = await buildToolsMonoRepo.install();
                    if (ret.error) {
                        log.errorLog("Install failed.");
                        this.signalFailure(state);
                    }
                } else {
                    log.warning(`Skipping installation.`);
                }

                this.signalSuccess(state);
                break;
            }

            case "CheckMainNextIntegrated": {
                if (testMode) return true;

                const { bumpType, shouldCheckMainNextIntegrated } = data;

                // TODO: Implement this
                if (bumpType === "major") {
                    if (shouldCheckMainNextIntegrated === true) {
                        log.warning(
                            chalk.red(`Automated main/next integration check not yet implemented.`),
                        );
                        log.warning(
                            `Make sure next has been integrated into main before continuing.`,
                        );

                        const confirmIntegratedQuestion: inquirer.ConfirmQuestion = {
                            type: "confirm",
                            name: "integrated",
                            message: `Has next has been integrated into main?`,
                        };

                        const answers = await inquirer.prompt(confirmIntegratedQuestion);
                        if (answers.integrated !== true) {
                            this.signalFailure(state);
                        }
                    } else {
                        log.warning("Skipping main/next integration check.");
                    }
                }

                this.signalSuccess(state);
                break;
            }

            case "CheckReleaseIsDone": {
                if (testMode) return true;

                const { releaseGroup, releaseVersion } = data;

                const wasReleased = await isReleased(context, releaseGroup!, releaseVersion!);
                if (wasReleased) {
                    this.signalSuccess(state);
                } else {
                    this.signalFailure(state);
                }

                break;
            }

            case "CheckReleaseGroupIsNotBumped": {
                if (testMode) return true;

                const { releaseGroup, releaseVersion } = data;

                const rgVersion = context.getVersion(releaseGroup!);
                if (rgVersion === releaseVersion) {
                    this.signalSuccess(state);
                    break;
                }

                log.warning(
                    `Release group ${releaseGroup} has already been bumped. It is at version ${rgVersion}; current released version ${releaseVersion}`,
                );
                this.signalFailure(state);
                break;
            }

            case "DoReleaseGroupBump": {
                if (testMode) return true;

                const { bumpType, releaseGroup, releaseVersion, shouldInstall } = data;

                assert(bumpType !== undefined, `bumpType is undefined.`);

                const rgRepo = isReleaseGroup(releaseGroup)
                    ? context.repo.releaseGroups.get(releaseGroup)!
                    : context.fullPackageMap.get(releaseGroup!)!;
                const scheme = detectVersionScheme(releaseVersion!);
                const newVersion = bumpVersionScheme(releaseVersion, bumpType, scheme);
                const packages = rgRepo instanceof MonoRepo ? rgRepo.packages : [rgRepo];

                log.info(
                    `Version ${releaseVersion} of ${releaseGroup} already released, so we can bump to ${newVersion} (${chalk.blue(
                        bumpType,
                    )} bump)!`,
                );

                const bumpResults = await bumpReleaseGroup(context, bumpType, rgRepo, scheme);
                log.verbose(`Raw bump results:`);
                log.verbose(bumpResults);

                if (shouldInstall === true && !(await FluidRepo.ensureInstalled(packages, false))) {
                    log.errorLog("Install failed.");
                    this.signalFailure(state);
                }

                this.signalSuccess(state);
                break;
            }

            case "PromptToIntegrateNext": {
                if (testMode) return true;

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
                break;
            }

            case "PromptToRelease": {
                if (testMode) return true;

                const { command, releaseGroup, releaseVersion } = data;

                const flag = isReleaseGroup(releaseGroup) ? "-g" : "-p";
                await this.writePrompt({
                    title: `READY TO RELEASE version ${chalk.bold(releaseVersion!)}!`,
                    sections: [
                        {
                            title: "FIRST",
                            message: `Queue a ${chalk.green(
                                chalk.bold("release"),
                            )} build for the following release group in ADO for branch ${chalk.blue(
                                chalk.bold(context.originalBranchName),
                            )}:\n\n    ${chalk.green(chalk.bold(releaseGroup!))}`,
                        },
                        {
                            title: "NEXT",
                            message: `After the build is done and the release group has been published, run the following command to bump the release group to the next version and update dependencies on the newly released package(s):`,
                            cmd: `${command?.config.bin} ${command?.id} ${flag} ${releaseGroup}`,
                        },
                    ],
                });
                break;
            }

            case "DoBumpReleasedDependencies": {
                if (testMode) return true;

                const { releaseGroup } = data;

                const { releaseGroups, packages, isEmpty } = await getPreReleaseDependencies(
                    context,
                    releaseGroup!,
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
                    releaseGroup!,
                    [...packagesToBump],
                    "current",
                    /* prerelease */ true,
                    /* writeChanges */ false,
                    log,
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
                        releaseGroup!,
                        [...packagesToBump],
                        "current",
                        /* prerelease */ true,
                        /* writeChanges */ true,
                    ));
                }

                if (updatedPackages.length > 0) {
                    // There were updates, which is considered a failure.
                    this.signalFailure(state);
                    context.repo.reload();
                    break;
                }

                this.signalSuccess(state);
                break;
            }

            case "CheckReleaseBranchDoesNotExist": {
                if (testMode) return true;

                const { releaseGroup, releaseVersion } = data;

                assert(isReleaseGroup(releaseGroup), `Not a release group: ${releaseGroup}`);

                const releaseBranch = generateReleaseBranchName(releaseGroup, releaseVersion!);

                const commit = await context.gitRepo.getShaForBranch(releaseBranch);
                if (commit !== undefined) {
                    this.signalFailure(state);
                    log.errorLog(`${releaseBranch} already exists`);
                }

                this.signalSuccess(state);
                break;
            }

            case "PromptToPRDeps": {
                if (testMode) return true;

                const { command, releaseGroup } = data;

                await this.writePrompt({
                    title: "NEED TO UPDATE DEPENDENCIES",
                    sections: [
                        {
                            title: "FIRST",
                            message: `Push and create a PR for branch ${await context.gitRepo.getCurrentBranchName()} targeting the ${context.originalBranchName
                                } branch.`,
                        },
                        {
                            title: "NEXT",
                            message: `After the PR is merged, run the following command to continue the release:`,
                            cmd: `${command?.config.bin} ${command?.id} -g ${releaseGroup}`,
                        },
                    ],
                });
                break;
            }

            case "PromptToPRBump": {
                if (testMode) return true;

                const { command, releaseGroup, releaseVersion } = data;

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

                if (isReleaseGroup(releaseGroup)) {
                    const releaseBranch = generateReleaseBranchName(releaseGroup, releaseVersion!);

                    const releaseBranchExists =
                        (await context.gitRepo.getShaForBranch(releaseBranch)) !== undefined;

                    if (!releaseBranchExists) {
                        prompt.sections.push({
                            title: "NEXT",
                            message: `After PR is merged, create branch '${releaseBranch}' one commit before the merged PR and push to the repo.\n\nOnce the release branch has been created, switch to it and use the following command to release the ${releaseGroup} release group:`,
                            cmd: `${command?.config.bin} ${command?.id} -g ${releaseGroup}`,
                        });
                    }
                }

                await this.writePrompt(prompt);
                break;
            }

            case "CheckShouldCommitBump":
            case "CheckShouldCommitDeps": {
                if (testMode) return true;

                const { bumpType, shouldCommit, releaseGroup, releaseVersion } = data;

                if (shouldCommit !== true) {
                    this.signalFailure(state);
                    break;
                }

                const version = releaseVersion;
                const newVersion = bumpVersionScheme(version, bumpType!);

                const branchName = generateBumpVersionBranchName(
                    releaseGroup!,
                    bumpType!,
                    releaseVersion!,
                );

                await context.createBranch(branchName);

                log.verbose(`Created bump branch: ${branchName}`);

                const commitMsg = `[bump] ${releaseGroup}: ${version} => ${newVersion} (${bumpType})\n\nPost-release ${bumpType} bump of ${releaseGroup}.`;
                await context.gitRepo.commit(commitMsg, `Error committing to ${branchName}`);
                this.signalSuccess(state);
                break;
            }

            case "CheckShouldCommitReleasedDepsBump": {
                if (testMode) return true;

                const { releaseGroup, shouldCommit } = data;

                if (shouldCommit !== true) {
                    this.signalSuccess(state);
                }

                assert(isReleaseGroup(releaseGroup), `Not a release group: ${releaseGroup}`);
                const branchName = generateBumpDepsBranchName(releaseGroup, "releasedDeps");
                await context.gitRepo.createBranch(branchName);

                log.verbose(`Created bump branch: ${branchName}`);
                log.info(
                    `BUMP: ${releaseGroup}: Bumped prerelease dependencies to release versions.`,
                );

                const commitMsg = `[bump] ${releaseGroup}: update prerelease dependencies to release versions`;
                await context.gitRepo.commit(commitMsg, `Error committing to ${branchName}`);
                this.signalSuccess(state);
                break;
            }

            case "PromptToCommitBump": {
                if (testMode) return true;

                const { releaseGroup } = data;

                const prompt: InstructionalPrompt = {
                    title: "NEED TO COMMIT LOCAL CHANGES",
                    sections: [
                        {
                            title: "FIRST",
                            message: `Commit the local changes and create a PR targeting the ${context.originalBranchName} branch.\n\nAfter the PR is merged, then the release of ${releaseGroup} is complete!`,
                        },
                    ],
                };
                await this.writePrompt(prompt);
                break;
            }

            case "PromptToCommitDeps":
            case "PromptToCommitReleasedDepsBump": {
                if (testMode) return true;

                const { releaseGroup } = data;

                const prompt: InstructionalPrompt = {
                    title: "NEED TO COMMIT LOCAL CHANGES",
                    sections: [
                        {
                            title: "FIRST",
                            message: `Commit the local changes and create a PR targeting the ${context.originalBranchName} branch.\n\nAfter the PR is merged, then the release of ${releaseGroup} is complete!`,
                        },
                    ],
                };
                await this.writePrompt(prompt);
                break;
            }

            case "PromptToReleaseDeps": {
                if (testMode) return true;

                const { releaseGroup } = data;

                const prereleaseDepNames = await getPreReleaseDependencies(context, releaseGroup!);

                const prompt: InstructionalPrompt = {
                    title: "NEED TO RELEASE DEPENDENCIES",
                    sections: [
                        {
                            title: "DETAILS",
                            message: chalk.red(
                                `\nCan't release the ${releaseGroup} release group because some of its dependencies need to be released first.`,
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
                break;
            }

            case "PromptToPRReleasedDepsBump": {
                if (testMode) return true;

                log.errorLog(`Not yet implemented`);
                break;
            }

            default: {
                superShouldHandle = true;
            }
        }

        // if (testMode && localHandled !== true) {
        //     return false;
        // }

        if (superShouldHandle === true) {
            const superHandled = await super.handleState(
                context,
                state,
                machine,
                testMode,
                log,
                data,
            );
            return superHandled;
        }

        if (this.machine.state_is_final(state)) {
            log.verbose(`Exiting. Final state: ${state}`);
            // eslint-disable-next-line no-process-exit, unicorn/no-process-exit
            process.exit();
        }

        return true;
    }
}
