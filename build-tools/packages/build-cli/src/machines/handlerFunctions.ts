import { strict as assert } from "assert";
import path from "path";
import { bumpVersionScheme } from "@fluid-tools/version-tools";
import { Context, exec } from "@fluidframework/build-tools";
import inquirer from "inquirer";
import { Machine } from "jssm";
import { getDefaultBumpTypeForBranch, getPreReleaseDependencies } from "../lib";
import { CommandLogger } from "../logging";
import { FluidReleaseStateHandlerData } from "./fluidReleaseStateHandlerData";
import { BaseStateHandler, StateHandlerFunction } from "./stateHandlers";
import type { MachineState } from "./machineState";

/* eslint-disable max-params */

/**
 * Determines the release type based on context, or by asking the user if needed.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const askForReleaseType: StateHandlerFunction = async (
    state: MachineState,
    machine: Machine<unknown>,
    testMode: boolean,
    log: CommandLogger,
    data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
    if (testMode) return true;

    const { bumpType: inputBumpType, context, releaseGroup } = data;
    assert(context !== undefined, "Context is undefined.");

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
    machine.action(bumpType);

    BaseStateHandler.signalSuccess(machine, state);
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
) => {
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

    const { releaseGroups, packages, isEmpty } = await getPreReleaseDependencies(
        context,
        releaseGroup!,
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

/* eslint-enable max-params */
