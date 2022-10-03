/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Machine } from "jssm";
import chalk from "chalk";
import type { InstructionalPrompt } from "../instructionalPromptWriter";
import { difference, generateReleaseBranchName, getPreReleaseDependencies } from "../lib";
import { CommandLogger } from "../logging";
import { MachineState } from "../machines";
import { isReleaseGroup } from "../releaseGroups";
import { FluidReleaseStateHandlerData } from "./fluidReleaseStateHandler";
import { StateHandlerFunction } from "./stateHandlers";

/**
 * Prompt the user to queue a release build.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const promptToCommitChanges: StateHandlerFunction = async (
    state: MachineState,
    machine: Machine<unknown>,
    testMode: boolean,
    log: CommandLogger,
    data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
    if (testMode) return true;

    const { context, promptWriter } = data;
    assert(context !== undefined, "Context is undefined.");

    const prompt: InstructionalPrompt = {
        title: "NEED TO COMMIT LOCAL CHANGES",
        sections: [
            {
                title: "FIRST",
                message: `Commit the local changes and create a PR targeting the ${context.originalBranchName} branch.`,
            },
        ],
    };
    await promptWriter?.writePrompt(prompt);
    return true;
};

/**
 * Prompt the user to create a release branch.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const promptToCreateReleaseBranch: StateHandlerFunction = async (
    state: MachineState,
    machine: Machine<unknown>,
    testMode: boolean,
    log: CommandLogger,
    data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
    if (testMode) return true;

    const { command, context, promptWriter, releaseGroup, releaseVersion } = data;
    assert(context !== undefined, "Context is undefined.");

    if (isReleaseGroup(releaseGroup)) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const releaseBranch = generateReleaseBranchName(releaseGroup, releaseVersion!);

        const prompt: InstructionalPrompt = {
            title: "CREATE A RELEASE BRANCH",
            sections: [
                {
                    title: "FIRST: find the right commit",
                    message: `The release branch should be created at the commit BEFORE the release group was bumped. Take a moment to find that commit.`,
                },
                {
                    title: "NEXT: create the release branch",
                    message: `Create the release branch using the following command, replacing <COMMIT> with the commit you found before:`,
                    cmd: `git branch ${releaseBranch} <COMMIT>`,
                },
                {
                    title: "NEXT: push the release branch",
                    message: `Push the release branch to the upstream microsoft/FluidFramework repo.`,
                    cmd: `git branch ${releaseBranch} <COMMIT>`,
                },
                {
                    title: "FINALLY: run the release command again",
                    message: `After the release branch is pushed, switch to it and run the following command to continue the release:`,
                    cmd: `${command?.config.bin} ${command?.id} ${command?.argv?.join(" ")}`,
                },
            ],
        };
        await promptWriter?.writePrompt(prompt);
    }

    return true;
};

/**
 * Prompt the user to queue a release build.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const promptToIntegrateNext: StateHandlerFunction = async (
    state: MachineState,
    machine: Machine<unknown>,
    testMode: boolean,
    log: CommandLogger,
    data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
    if (testMode) return true;

    const { context, promptWriter } = data;
    assert(context !== undefined, "Context is undefined.");

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

    await promptWriter?.writePrompt(prompt);
    return true;
};

/**
 * Prompt the user to open a PR with a release group/package bump.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const promptToPRBump: StateHandlerFunction = async (
    state: MachineState,
    machine: Machine<unknown>,
    testMode: boolean,
    log: CommandLogger,
    data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
    if (testMode) return true;

    const { command, context, promptWriter, releaseGroup, releaseVersion } = data;
    assert(context !== undefined, "Context is undefined.");

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
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const releaseBranch = generateReleaseBranchName(releaseGroup, releaseVersion!);

        const releaseBranchExists =
            (await context.gitRepo.getShaForBranch(releaseBranch)) !== undefined;

        if (!releaseBranchExists) {
            prompt.sections.push({
                title: "NEXT",
                message: `After PR is merged, switch to the '${releaseBranch}' branch and and use the following command to release the ${releaseGroup} release group:`,
                cmd: `${command?.config.bin} ${command?.id} -g ${releaseGroup}`,
            });
        }
    }

    await promptWriter?.writePrompt(prompt);
    return true;
};

/**
 * Prompt the user to open a PR with dependency updates.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const promptToPRDeps: StateHandlerFunction = async (
    state: MachineState,
    machine: Machine<unknown>,
    testMode: boolean,
    log: CommandLogger,
    data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
    if (testMode) return true;

    const { command, context, promptWriter, releaseGroup } = data;
    assert(context !== undefined, "Context is undefined.");

    await promptWriter?.writePrompt({
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
                cmd: `${command?.config.bin} ${command?.id} -g ${releaseGroup}`,
            },
        ],
    });
    return true;
};

/**
 * Prompt the user to queue a release build.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const promptToRelease: StateHandlerFunction = async (
    state: MachineState,
    machine: Machine<unknown>,
    testMode: boolean,
    log: CommandLogger,
    data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
    if (testMode) return true;

    const { command, context, releaseGroup, releaseVersion, promptWriter } = data;
    assert(context !== undefined, "Context is undefined.");

    const flag = isReleaseGroup(releaseGroup) ? "-g" : "-p";
    const prompt: InstructionalPrompt = {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        title: `READY TO RELEASE version ${chalk.bold(releaseVersion!)}!`,
        sections: [
            {
                title: "FIRST",
                message: `Queue a ${chalk.green(
                    chalk.bold("release"),
                )} build for the following release group in ADO for branch ${chalk.blue(
                    chalk.bold(context.originalBranchName),
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                )}:\n\n    ${chalk.green(chalk.bold(releaseGroup!))}`,
            },
            {
                title: "NEXT",
                message: `After the build is done and the release group has been published, run the following command to bump the release group to the next version and update dependencies on the newly released package(s):`,
                cmd: `${command?.config.bin} ${command?.id} ${flag} ${releaseGroup}`,
            },
        ],
    };

    await promptWriter?.writePrompt(prompt);
    return true;
};

/**
 * Prompt the user to queue a release build.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const promptToReleaseDeps: StateHandlerFunction = async (
    state: MachineState,
    machine: Machine<unknown>,
    testMode: boolean,
    log: CommandLogger,
    data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
    if (testMode) return true;

    const { context, promptWriter, releaseGroup } = data;
    assert(context !== undefined, "Context is undefined.");
    assert(promptWriter !== undefined, "promptWriter is undefined.");

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const prereleaseDepNames = await getPreReleaseDependencies(context, releaseGroup!);

    const prompt: InstructionalPrompt = {
        title: "NEED TO RELEASE DEPENDENCIES",
        sections: [
            {
                title: "DETAILS",
                message: chalk.red(
                    `Can't release the ${releaseGroup} release group because some of its dependencies need to be released first.`,
                ),
            },
        ],
    };

    if (prereleaseDepNames.releaseGroups.size > 0 || prereleaseDepNames.packages.size > 0) {
        if (prereleaseDepNames.packages.size > 0) {
            let packageSection = "";
            for (const [pkg, depVersion] of prereleaseDepNames.packages.entries()) {
                packageSection += `${pkg} = ${depVersion}`;
            }

            prompt.sections.push({
                title: "FIRST",
                message: `Release these packages first:\n\n${chalk.blue(packageSection)}`,
            });
        }

        if (prereleaseDepNames.releaseGroups.size > 0) {
            let packageSection = "";
            for (const [rg, depVersion] of prereleaseDepNames.releaseGroups.entries()) {
                packageSection += `${rg} = ${depVersion}`;
            }

            prompt.sections.push({
                title: "NEXT",
                message: `Release these release groups:\n\n${chalk.blue(packageSection)}`,
            });
        }
    }

    await promptWriter?.writePrompt(prompt);
    return true;
};

/**
 * Prompt the user to run a minor release of the release group. This is typically used when doing major releases,
 * because a minor release is a subset of the major release process.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const promptToRunMinorReleaseCommand: StateHandlerFunction = async (
    state: MachineState,
    machine: Machine<unknown>,
    testMode: boolean,
    log: CommandLogger,
    data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
    if (testMode) return true;

    const { command, context, promptWriter, releaseGroup } = data;
    assert(command !== undefined, "Command is undefined.");
    assert(context !== undefined, "Context is undefined.");
    assert(promptWriter !== undefined, "promptWriter is undefined.");
    assert(releaseGroup !== undefined, "Release group is undefined.");

    const prompt: InstructionalPrompt = {
        title: "NEED TO DO A MINOR RELEASE",
        sections: [],
    };

    // Remove arguments from the list passed into the command to build the re-run command with the same flags. Assumes
    // no flags that support multiple values.
    const uniqueArgs = [
        ...difference(
            new Set(command.argv),
            new Set([
                "-g",
                "--releaseGroup",
                releaseGroup,
                "-t",
                "--bumpType",
                "minor",
                "major",
                "patch",
            ]),
        ),
    ];

    prompt.sections.push(
        {
            title: "FIRST: do a minor release",
            message: `A minor release needs to be run in order to continue with the major release. To continue with the release, run the following command on the ${context.originalBranchName} branch:`,
            cmd: `${command?.config.bin} ${command?.id} -g ${releaseGroup} -t minor ${chalk.gray(
                uniqueArgs.join(" "),
            )}`,
        },
        {
            title: "NEXT: run the major release again",
            message: `Once the minor release is fully complete, run the following command on the ${context.originalBranchName} branch to continue the major release.`,
            cmd: `${command?.config.bin} ${command?.id} -g ${releaseGroup} -t major ${chalk.gray(
                uniqueArgs.join(" "),
            )}`,
        },
    );

    await promptWriter?.writePrompt(prompt);
    return true;
};

/**
 * Prompt the user to run type test preparation and generation.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const promptToRunTypeTests: StateHandlerFunction = async (
    state: MachineState,
    machine: Machine<unknown>,
    testMode: boolean,
    log: CommandLogger,
    data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
    if (testMode) return true;

    const { command, context, promptWriter } = data;
    assert(context !== undefined, "Context is undefined.");
    assert(promptWriter !== undefined, "promptWriter is undefined.");

    const prompt: InstructionalPrompt = {
        title: "NEED TO RUN TYPE TEST GENERATION",
        sections: [
            {
                title: "FIRST: typetests:prepare",
                message: `To prepare the type tests, run the following command from the root of your release repo:`,
                cmd: `npm run typetests:prepare`,
            },
            {
                title: "NEXT: typetests:prepare",
                message: `To regenerate type tests, run the following command from the root of your release repo:`,
                cmd: `npm run typetests:gen`,
            },
            {
                title: "FINALLY: merge the resulting changes",
                message: `Merge the resulting changes into the repo, then run the following command to continue the release:`,
                cmd: `${command?.config.bin} ${command?.id} ${command?.argv?.join(" ")}`,
            },
        ],
    };

    await promptWriter?.writePrompt(prompt);
    return true;
};
