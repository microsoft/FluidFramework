/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { VersionScheme, VersionBumpType, ReleaseVersion } from "@fluid-tools/version-tools";
import { Context } from "@fluidframework/build-tools";
import { Command } from "@oclif/core";
import chalk from "chalk";
import { Machine } from "jssm";
import { InstructionalPromptWriter } from "../instructionalPromptWriter";
import { CommandLogger } from "../logging";
import { MachineState } from "../machines";
import { ReleaseGroup, ReleasePackage } from "../releaseGroups";
import {
    checkShouldRunOptionalChecks,
    checkValidReleaseGroup,
    checkPolicy,
    checkHasRemote,
    checkNoPrereleaseDependencies,
    checkBranchUpToDate,
    checkBranchName,
    checkInstallBuildTools,
    checkMainNextIntegrated,
    checkReleaseIsDone,
    checkReleaseGroupIsBumped,
    checkShouldCommit,
    checkShouldCommitReleasedDepsBump,
    checkTypeTestGenerate,
    checkTypeTestPrepare,
    checkOnReleaseBranch,
    checkDoesReleaseFromReleaseBranch,
    checkReleaseBranchExists,
} from "./checkFunctions";
import { askForReleaseType } from "./askFunctions";
import { InitFailedStateHandler } from "./initFailedStateHandler";
import { BaseStateHandler } from "./stateHandlers";
import {
    promptToCommitChanges,
    promptToCreateReleaseBranch,
    promptToIntegrateNext,
    promptToPRBump,
    promptToPRDeps,
    promptToRelease,
    promptToReleaseDeps,
    promptToRunMinorReleaseCommand,
    promptToRunTypeTests,
} from "./promptFunctions";
import { doBumpReleasedDependencies, doReleaseGroupBump } from "./doFunctions";

/**
 * Data that is passed to all the handling functions for the {@link FluidReleaseMachine}. This data is intended to be
 * used only within the {@link FluidReleaseStateHandler}.
 */
export interface FluidReleaseStateHandlerData {
    /**
     * The {@link Context}.
     */
    context?: Context;

    /**
     * The release group or package that is being released.
     */
    releaseGroup?: ReleaseGroup | ReleasePackage;

    /**
     * The version scheme used by the release group or package being released.
     */
    versionScheme?: VersionScheme;

    /**
     * The bump type used for this release.
     */
    bumpType?: VersionBumpType;

    /**
     * An {@link InstructionalPromptWriter} that the command can use to display instructional prompts.
     */
    promptWriter?: InstructionalPromptWriter;

    /**
     * The version being released.
     */
    releaseVersion?: ReleaseVersion;

    /**
     * True if all optional checks should be skipped.
     */
    shouldSkipChecks?: boolean;

    /**
     * True if repo policy should be checked.
     */
    shouldCheckPolicy?: boolean;

    /**
     * True if the branch names should be checked.
     */
    shouldCheckBranch?: boolean;

    /**
     * True if the branch must be up-to-date with the remote.
     */
    shouldCheckBranchUpdate?: boolean;

    /**
     * True if changes should be committed automatically.
     */
    shouldCommit?: boolean;

    /**
     * True if `npm install` should be run on changed release groups and packages.
     */
    shouldInstall?: boolean;

    /**
     * True if the main and next branches should be checked to confirm that they are merged.
     */
    shouldCheckMainNextIntegrated?: boolean;

    /**
     * The {@link Command} class that represents the release command, which is {@link ReleaseCommand}. This is used to
     * get the command name and arguments for printing instructions to run the command again.
     */
    command?: Command;

    /**
     * A function that the state handlers can call to exit the application if needed. If this is undefined then the
     * handler function will not exit the app itself.
     */
    exitFunc?: (code?: number) => void;
}

/**
 * A state handler for the {@link FluidReleaseMachine}. It uses the {@link InitFailedStateHandler} as a base class so
 * the Init and Failed states are handled by that class. The logic for the individual handler functions is not within
 * this class; it only acts as a "router" to route to the correct function based on the current state.
 */
export class FluidReleaseStateHandler extends InitFailedStateHandler {
    // eslint-disable-next-line complexity
    async handleState(
        state: MachineState,
        machine: Machine<unknown>,
        testMode: boolean,
        log: CommandLogger,
        data: FluidReleaseStateHandlerData,
    ): Promise<boolean> {
        const { context } = data;
        assert(context !== undefined, "Context is undefined.");

        let superShouldHandle = false;
        let result = false;

        switch (state) {
            case "AskForReleaseType": {
                result = await askForReleaseType(state, machine, testMode, log, data);
                break;
            }

            case "CheckShouldRunOptionalChecks": {
                result = await checkShouldRunOptionalChecks(state, machine, testMode, log, data);
                break;
            }

            case "CheckValidReleaseGroup": {
                result = await checkValidReleaseGroup(state, machine, testMode, log, data);
                break;
            }

            case "CheckPolicy": {
                result = await checkPolicy(state, machine, testMode, log, data);
                break;
            }

            case "CheckHasRemote": {
                result = await checkHasRemote(state, machine, testMode, log, data);
                break;
            }

            case "CheckBranchUpToDate": {
                result = await checkBranchUpToDate(state, machine, testMode, log, data);
                break;
            }

            case "CheckNoPrereleaseDependencies3":
            case "CheckNoPrereleaseDependencies2":
            case "CheckNoPrereleaseDependencies": {
                result = await checkNoPrereleaseDependencies(state, machine, testMode, log, data);
                break;
            }

            case "DoPatchRelease":
            case "DoMinorRelease":
            case "DoMajorRelease": {
                if (testMode) return true;

                const { bumpType } = data;

                if (bumpType === undefined) {
                    BaseStateHandler.signalFailure(machine, state);
                }

                BaseStateHandler.signalSuccess(machine, state);
                break;
            }

            case "CheckBranchName":
            case "CheckBranchName2":
            case "CheckBranchName3": {
                result = await checkBranchName(state, machine, testMode, log, data);
                break;
            }

            case "CheckDoesReleaseFromReleaseBranch":
            case "CheckDoesReleaseFromReleaseBranch2":
            case "CheckDoesReleaseFromReleaseBranch3": {
                result = await checkDoesReleaseFromReleaseBranch(
                    state,
                    machine,
                    testMode,
                    log,
                    data,
                );
                break;
            }

            case "CheckInstallBuildTools": {
                result = await checkInstallBuildTools(state, machine, testMode, log, data);
                break;
            }

            case "CheckMainNextIntegrated": {
                result = await checkMainNextIntegrated(state, machine, testMode, log, data);
                break;
            }

            case "CheckOnReleaseBranch":
            case "CheckOnReleaseBranch2":
            case "CheckOnReleaseBranch3": {
                result = await checkOnReleaseBranch(state, machine, testMode, log, data);
                break;
            }

            case "CheckReleaseIsDone":
            case "CheckReleaseIsDone2":
            case "CheckReleaseIsDone3": {
                result = await checkReleaseIsDone(state, machine, testMode, log, data);
                break;
            }

            case "CheckReleaseGroupIsBumped":
            case "CheckReleaseGroupIsBumpedMinor":
            case "CheckReleaseGroupIsBumpedMinor2":
            case "CheckReleaseGroupIsBumpedPatch":
            case "CheckReleaseGroupIsBumpedPatch2": {
                result = await checkReleaseGroupIsBumped(state, machine, testMode, log, data);
                break;
            }

            case "CheckTypeTestGenerate":
            case "CheckTypeTestGenerate2": {
                result = await checkTypeTestGenerate(state, machine, testMode, log, data);
                break;
            }

            case "CheckTypeTestPrepare":
            case "CheckTypeTestPrepare2": {
                result = await checkTypeTestPrepare(state, machine, testMode, log, data);
                break;
            }

            case "DoReleaseGroupBump": {
                result = await doReleaseGroupBump(state, machine, testMode, log, data);
                break;
            }

            case "DoBumpReleasedDependencies": {
                result = await doBumpReleasedDependencies(state, machine, testMode, log, data);
                break;
            }

            case "CheckReleaseBranchExists": {
                result = await checkReleaseBranchExists(state, machine, testMode, log, data);
                break;
            }

            case "CheckShouldCommitBump":
            case "CheckShouldCommitDeps": {
                result = await checkShouldCommit(state, machine, testMode, log, data);
                break;
            }

            case "CheckShouldCommitReleasedDepsBump": {
                result = await checkShouldCommitReleasedDepsBump(
                    state,
                    machine,
                    testMode,
                    log,
                    data,
                );
                break;
            }

            case "PromptToCreateReleaseBranch": {
                result = await promptToCreateReleaseBranch(state, machine, testMode, log, data);
                break;
            }

            case "PromptToIntegrateNext": {
                result = await promptToIntegrateNext(state, machine, testMode, log, data);
                break;
            }

            case "PromptToRelease": {
                result = await promptToRelease(state, machine, testMode, log, data);
                break;
            }

            case "PromptToPRDeps": {
                result = await promptToPRDeps(state, machine, testMode, log, data);
                break;
            }

            case "PromptToPRBump": {
                result = await promptToPRBump(state, machine, testMode, log, data);
                break;
            }

            case "PromptToCommitBump":
            case "PromptToCommitDeps":
            case "PromptToCommitReleasedDepsBump": {
                result = await promptToCommitChanges(state, machine, testMode, log, data);
                break;
            }

            case "PromptToReleaseDeps": {
                result = await promptToReleaseDeps(state, machine, testMode, log, data);
                break;
            }

            case "PromptToPRReleasedDepsBump": {
                if (testMode) return true;

                log.errorLog(`Not yet implemented`);
                if (data.exitFunc !== undefined) {
                    data.exitFunc(101);
                }

                break;
            }

            case "PromptToRunMinorReleaseCommand": {
                result = await promptToRunMinorReleaseCommand(state, machine, testMode, log, data);
                break;
            }

            case "PromptToRunTypeTests": {
                result = await promptToRunTypeTests(state, machine, testMode, log, data);
                break;
            }

            case "ReleaseComplete": {
                log.info(chalk.green("Release complete!"));
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
            const superHandled = await super.handleState(state, machine, testMode, log, data);
            return superHandled;
        }

        return true;
    }
}
