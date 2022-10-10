/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import inquirer from "inquirer";
import { Machine } from "jssm";
import path from "path";

import { MonoRepoKind, exec } from "@fluidframework/build-tools";

import { bumpVersionScheme } from "@fluid-tools/version-tools";

import {
    generateBumpDepsBranchName,
    generateBumpVersionBranchName,
    generateCommitMessage,
    generateReleaseBranchName,
    getPreReleaseDependencies,
    getReleaseSourceForReleaseGroup,
    isReleased,
} from "../lib";
import { CommandLogger } from "../logging";
import { MachineState } from "../machines";
import { isReleaseGroup } from "../releaseGroups";
import { FluidReleaseStateHandlerData } from "./fluidReleaseStateHandler";
import { BaseStateHandler, StateHandlerFunction } from "./stateHandlers";

/**
 * Checks that the current branch matches the expected branch for a release.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkBranchName: StateHandlerFunction = async (
    state: MachineState,
    machine: Machine<unknown>,
    testMode: boolean,
    log: CommandLogger,
    data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
    if (testMode) return true;

    const { context, bumpType, shouldCheckBranch } = data;
    assert(context !== undefined, "Context is undefined.");

    if (shouldCheckBranch === true) {
        switch (bumpType) {
            case "patch": {
                log.verbose(`Checking if ${context.originalBranchName} starts with release/`);
                if (!context.originalBranchName.startsWith("release/")) {
                    log.warning(
                        `Patch release should only be done on 'release/*' branches, but current branch is '${context.originalBranchName}'.\nYou can skip this check with --no-branchCheck.'`,
                    );
                    BaseStateHandler.signalFailure(machine, state);
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
                    BaseStateHandler.signalFailure(machine, state);
                    return true;
                }
            }

            default: {
                log.errorLog(`Unexpected bump type: ${bumpType}`);
            }
        }
    } else {
        log.warning(
            `Not checking if current branch is a release branch: ${context.originalBranchName}`,
        );
    }

    BaseStateHandler.signalSuccess(machine, state);
    return true;
};

/**
 * Checks that the branch is up-to-date with the remote branch.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkBranchUpToDate: StateHandlerFunction = async (
    state: MachineState,
    machine: Machine<unknown>,
    testMode: boolean,
    log: CommandLogger,
    data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
    if (testMode) return true;

    const { context, shouldCheckBranchUpdate } = data;
    assert(context !== undefined, "Context is undefined.");

    const remote = await context.gitRepo.getRemote(context.originRemotePartialUrl);
    const isBranchUpToDate = await context.gitRepo.isBranchUpToDate(
        context.originalBranchName,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        remote!,
    );
    if (shouldCheckBranchUpdate === true) {
        if (!isBranchUpToDate) {
            BaseStateHandler.signalFailure(machine, state);
            log.errorLog(
                `Local '${context.originalBranchName}' branch not up to date with remote. Please pull from '${remote}'.`,
            );
        }

        BaseStateHandler.signalSuccess(machine, state);
    } else {
        log.warning("Not checking if the branch is up-to-date with the remote.");
        BaseStateHandler.signalSuccess(machine, state);
    }

    return true;
};

/**
 * Checks if the release group releases from a release branch or not.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkDoesReleaseFromReleaseBranch: StateHandlerFunction = async (
    state: MachineState,
    machine: Machine<unknown>,
    testMode: boolean,
    log: CommandLogger,
    data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
    if (testMode) return true;

    const { context, releaseGroup } = data;
    assert(context !== undefined, "Context is undefined.");
    assert(releaseGroup !== undefined, "Release group is undefined.");

    let releaseSource = getReleaseSourceForReleaseGroup(releaseGroup);

    if (releaseSource === "interactive") {
        const branchToReleaseFrom: inquirer.ListQuestion = {
            type: "list",
            name: "releaseType",
            choices: [
                {
                    name: "main/lts",
                    value: "direct",
                },
                { name: "release branch", value: "releaseBranches" },
            ],
            message: `The ${releaseGroup} release group can be released directly from main, or you can create a release branch. Would you like to release from main or a release branch? If in doubt, select 'release branch'.`,
        };

        const answers = await inquirer.prompt(branchToReleaseFrom);
        releaseSource = answers.releaseType;
    }

    if (releaseSource === "direct") {
        BaseStateHandler.signalFailure(machine, state);
    } else if (releaseSource === "releaseBranches") {
        BaseStateHandler.signalSuccess(machine, state);
    }

    return true;
};

/**
 * Checks that the repo has a remote configured for the microsoft/FluidFramework repo.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkHasRemote: StateHandlerFunction = async (
    state: MachineState,
    machine: Machine<unknown>,
    testMode: boolean,
    log: CommandLogger,
    data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
    if (testMode) return true;

    const { context } = data;
    assert(context !== undefined, "Context is undefined.");

    const remote = await context.gitRepo.getRemote(context.originRemotePartialUrl);
    if (remote === undefined) {
        BaseStateHandler.signalFailure(machine, state);
        log.errorLog(`Unable to find remote for '${context.originRemotePartialUrl}'`);
    }

    BaseStateHandler.signalSuccess(machine, state);
    return true;
};

/**
 * Checks that the Fluid build tools are installed.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkInstallBuildTools: StateHandlerFunction = async (
    state: MachineState,
    machine: Machine<unknown>,
    testMode: boolean,
    log: CommandLogger,
    data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
    if (testMode) return true;

    const { context } = data;
    assert(context !== undefined, "Context is undefined.");

    const installQuestion: inquirer.ConfirmQuestion = {
        type: "confirm",
        name: "install",
        message: `Do you want to install the Fluid build-tools? You don't need to do this if you installed them globally.`,
    };

    const answer = await inquirer.prompt(installQuestion);
    if (answer.install === true) {
        log.info(`Installing build-tools so we can run build:genver`);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const buildToolsMonoRepo = context.repo.releaseGroups.get(MonoRepoKind.BuildTools)!;
        const ret = await buildToolsMonoRepo.install();
        if (ret.error) {
            log.errorLog("Install failed.");
            BaseStateHandler.signalFailure(machine, state);
        }
    } else {
        log.warning(`Skipping installation.`);
    }

    BaseStateHandler.signalSuccess(machine, state);
    return true;
};

/**
 * Checks that the main and next branches are integrated.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkMainNextIntegrated: StateHandlerFunction = async (
    state: MachineState,
    machine: Machine<unknown>,
    testMode: boolean,
    log: CommandLogger,
    data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
    if (testMode) return true;

    const { bumpType, shouldCheckMainNextIntegrated } = data;

    // TODO: Implement this
    if (bumpType === "major") {
        if (shouldCheckMainNextIntegrated === true) {
            log.warning(`Automated main/next integration check not yet implemented.`);
            log.warning(`Make sure next has been integrated into main before continuing.`);

            const confirmIntegratedQuestion: inquirer.ConfirmQuestion = {
                type: "confirm",
                name: "integrated",
                message: `Has next has been integrated into main?`,
            };

            const answers = await inquirer.prompt(confirmIntegratedQuestion);
            if (answers.integrated !== true) {
                BaseStateHandler.signalFailure(machine, state);
            }
        } else {
            log.warning("Skipping main/next integration check.");
        }
    }

    BaseStateHandler.signalSuccess(machine, state);
    return true;
};

/**
 * Checks that the repo is currently on the expected release branch.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkOnReleaseBranch: StateHandlerFunction = async (
    state: MachineState,
    machine: Machine<unknown>,
    testMode: boolean,
    log: CommandLogger,
    data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
    if (testMode) return true;

    const { context, releaseGroup, releaseVersion } = data;
    assert(context !== undefined, "Context is undefined.");
    assert(isReleaseGroup(releaseGroup), `Not a release group: ${releaseGroup}`);

    const currentBranch = await context.gitRepo.getCurrentBranchName();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const releaseBranch = generateReleaseBranchName(releaseGroup, releaseVersion!);

    if (currentBranch === releaseBranch) {
        BaseStateHandler.signalSuccess(machine, state);
    } else {
        BaseStateHandler.signalFailure(machine, state);
    }

    return true;
};

export const checkNoPrereleaseDependencies: StateHandlerFunction = async (
    state: MachineState,
    machine: Machine<unknown>,
    testMode: boolean,
    log: CommandLogger,
    data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
    if (testMode) return true;

    const { context, releaseGroup } = data;
    assert(context !== undefined, "Context is undefined.");
    assert(releaseGroup !== undefined, "Release group is undefined.");

    const { releaseGroups, packages, isEmpty } = await getPreReleaseDependencies(
        context,
        releaseGroup,
    );

    const packagesToBump = new Set(packages.keys());
    for (const rg of releaseGroups.keys()) {
        for (const p of context.packagesInReleaseGroup(rg)) {
            packagesToBump.add(p.name);
        }
    }

    if (isEmpty) {
        BaseStateHandler.signalSuccess(machine, state);
    } else {
        BaseStateHandler.signalFailure(machine, state);
    }

    return true;
};

/**
 * Runs the `check policy` command to check for policy violations in the repo.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkPolicy: StateHandlerFunction = async (
    state: MachineState,
    machine: Machine<unknown>,
    testMode: boolean,
    log: CommandLogger,
    data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
    if (testMode) return true;

    const { context, shouldCheckPolicy } = data;
    assert(context !== undefined, "Context is undefined.");

    if (shouldCheckPolicy === true) {
        if (context.originalBranchName !== "main") {
            log.warning(
                "WARNING: Policy check fixes are not expected outside of main branch!  Make sure you know what you are doing.",
            );
        }

        // await CheckPolicy.run([
        //     "--fix",
        //     "--exclusions",
        //     path.join(
        //         context.gitRepo.resolvedRoot,
        //         "build-tools",
        //         "packages",
        //         "build-tools",
        //         "data",
        //         "exclusions.json"
        //     )
        // ]);

        await exec(
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
            log.logHr();
            log.errorLog(
                `Policy check needed to make modifications. Please create PR for the changes and merge before retrying.\n${afterPolicyCheckStatus}`,
            );
            BaseStateHandler.signalFailure(machine, state);
        }
    } else {
        log.warning("Skipping policy check.");
    }

    BaseStateHandler.signalSuccess(machine, state);
    return true;
};

/**
 * Checks that a release branch exists.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkReleaseBranchExists: StateHandlerFunction = async (
    state: MachineState,
    machine: Machine<unknown>,
    testMode: boolean,
    log: CommandLogger,
    data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
    if (testMode) return true;

    const { context, releaseGroup, releaseVersion } = data;
    assert(context !== undefined, "Context is undefined.");
    assert(isReleaseGroup(releaseGroup), `Not a release group: ${releaseGroup}`);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const releaseBranch = generateReleaseBranchName(releaseGroup, releaseVersion!);

    const commit = await context.gitRepo.getShaForBranch(releaseBranch);
    if (commit === undefined) {
        log.errorLog(`Can't find the '${releaseBranch}' branch.`);
        BaseStateHandler.signalFailure(machine, state);
    }

    BaseStateHandler.signalSuccess(machine, state);
    return true;
};

/**
 * Checks that a release group has been bumped.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkReleaseGroupIsBumped: StateHandlerFunction = async (
    state: MachineState,
    machine: Machine<unknown>,
    testMode: boolean,
    log: CommandLogger,
    data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
    if (testMode) return true;

    const { context, releaseGroup, releaseVersion, bumpType } = data;
    assert(context !== undefined, "Context is undefined.");
    assert(releaseGroup !== undefined, "Release group is undefined.");
    assert(bumpType !== undefined, "bumpType is undefined.");

    context.repo.reload();
    const repoVersion = context.getVersion(releaseGroup);
    const targetVersion = bumpVersionScheme(releaseVersion, bumpType).version;

    if (repoVersion !== targetVersion) {
        BaseStateHandler.signalFailure(machine, state);
        return true;
    }

    BaseStateHandler.signalSuccess(machine, state);
    return true;
};

/**
 * Checks that the version of the release group or package in the repo has already been released. If this check
 * succeeds, it means that a bump is needed to bump the repo to the next version.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkReleaseIsDone: StateHandlerFunction = async (
    state: MachineState,
    machine: Machine<unknown>,
    testMode: boolean,
    log: CommandLogger,
    data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
    if (testMode) return true;

    const { context, releaseGroup, releaseVersion } = data;
    assert(context !== undefined, "Context is undefined.");

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const wasReleased = await isReleased(context, releaseGroup!, releaseVersion!);
    if (wasReleased) {
        BaseStateHandler.signalSuccess(machine, state);
    } else {
        BaseStateHandler.signalFailure(machine, state);
    }

    return true;
};

/**
 * Checks whether changes should be committed automatically.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkShouldCommit: StateHandlerFunction = async (
    state: MachineState,
    machine: Machine<unknown>,
    testMode: boolean,
    log: CommandLogger,
    data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
    if (testMode) return true;

    const { bumpType, context, shouldCommit, releaseGroup, releaseVersion } = data;
    assert(context !== undefined, "Context is undefined.");

    if (shouldCommit !== true) {
        BaseStateHandler.signalFailure(machine, state);
        return true;
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const branchName = generateBumpVersionBranchName(releaseGroup!, bumpType!, releaseVersion!);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const commitMsg = generateCommitMessage(releaseGroup!, bumpType!, releaseVersion!);

    await context.createBranch(branchName);
    log.verbose(`Created bump branch: ${branchName}`);

    await context.gitRepo.commit(commitMsg, `Error committing to ${branchName}`);
    BaseStateHandler.signalSuccess(machine, state);
    return true;
};

/**
 * Checks whether changes should be committed automatically.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkShouldCommitReleasedDepsBump: StateHandlerFunction = async (
    state: MachineState,
    machine: Machine<unknown>,
    testMode: boolean,
    log: CommandLogger,
    data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
    if (testMode) return true;

    const { context, releaseGroup, shouldCommit } = data;
    assert(context !== undefined, "Context is undefined.");

    if (shouldCommit !== true) {
        BaseStateHandler.signalSuccess(machine, state);
    }

    assert(isReleaseGroup(releaseGroup), `Not a release group: ${releaseGroup}`);
    const branchName = generateBumpDepsBranchName(releaseGroup, "latest");
    await context.gitRepo.createBranch(branchName);

    log.verbose(`Created bump branch: ${branchName}`);
    log.info(`${releaseGroup}: Bumped prerelease dependencies to release versions.`);

    const commitMsg = `[dependencies] ${releaseGroup}: update prerelease dependencies to release versions`;
    await context.gitRepo.commit(commitMsg, `Error committing to ${branchName}`);
    BaseStateHandler.signalSuccess(machine, state);
    return true;
};

/**
 * Checks whether optional checks should be run.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkShouldRunOptionalChecks: StateHandlerFunction = async (
    state: MachineState,
    machine: Machine<unknown>,
    testMode: boolean,
    log: CommandLogger,
    data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
    if (testMode) return true;

    const { shouldSkipChecks } = data;
    if (shouldSkipChecks === true) {
        BaseStateHandler.signalFailure(machine, state);
    }

    BaseStateHandler.signalSuccess(machine, state);
    return true;
};

/**
 * Checks that typetests:gen has been run.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkTypeTestGenerate: StateHandlerFunction = async (
    state: MachineState,
    machine: Machine<unknown>,
    testMode: boolean,
    log: CommandLogger,
    data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
    if (testMode) return true;

    const { context } = data;
    assert(context !== undefined, "Context is undefined.");

    const genQuestion: inquirer.ConfirmQuestion = {
        type: "confirm",
        name: "typetestsGen",
        message: `Have you run typetests:gen on the ${context.originalBranchName} branch?`,
    };

    const answer = await inquirer.prompt(genQuestion);
    if (answer.typetestsGen === false) {
        BaseStateHandler.signalFailure(machine, state);
    } else {
        BaseStateHandler.signalSuccess(machine, state);
    }

    return true;
};

/**
 * Checks that typetests: prepare has been run.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkTypeTestPrepare: StateHandlerFunction = async (
    state: MachineState,
    machine: Machine<unknown>,
    testMode: boolean,
    log: CommandLogger,
    data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
    if (testMode) return true;

    const { context } = data;
    assert(context !== undefined, "Context is undefined.");

    const prepQuestion: inquirer.ConfirmQuestion = {
        type: "confirm",
        name: "typetestsPrep",
        message: `Have you run typetests:prepare on the ${context.originalBranchName} branch?`,
    };

    const answer = await inquirer.prompt(prepQuestion);
    if (answer.typetestsPrep === false) {
        BaseStateHandler.signalFailure(machine, state);
    } else {
        BaseStateHandler.signalSuccess(machine, state);
    }

    return true;
};

/**
 * Checks that release group is known and valid.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const checkValidReleaseGroup: StateHandlerFunction = async (
    state: MachineState,
    machine: Machine<unknown>,
    testMode: boolean,
    log: CommandLogger,
    data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
    if (testMode) return true;

    const { context, releaseGroup } = data;
    assert(context !== undefined, "Context is undefined.");

    if (isReleaseGroup(releaseGroup)) {
        BaseStateHandler.signalSuccess(machine, state);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, no-negated-condition
    } else if (context.fullPackageMap.get(releaseGroup!) !== undefined) {
        BaseStateHandler.signalSuccess(machine, state);
    } else {
        BaseStateHandler.signalFailure(machine, state);
    }

    return true;
};
