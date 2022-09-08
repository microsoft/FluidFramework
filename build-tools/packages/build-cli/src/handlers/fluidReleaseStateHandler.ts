/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { VersionScheme, VersionBumpType } from "@fluid-tools/version-tools";
import { Context } from "@fluidframework/build-tools";
import { Command } from "@oclif/core";
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
    checkReleaseBranchDoesNotExist,
    checkShouldCommit,
    checkShouldCommitReleasedDepsBump,
} from "./checkFunctions";
import { askForReleaseType } from "./askFunctions";
import { InitFailedStateHandler } from "./initFailedStateHandler";
import { BaseStateHandler } from "./stateHandlers";
import {
    promptToCommitChanges,
    promptToIntegrateNext,
    promptToPRBump,
    promptToPRDeps,
    promptToRelease,
    promptToReleaseDeps,
} from "./promptFunctions";
import { doBumpReleasedDependencies, doReleaseGroupBump } from "./doFunctions";

export interface FluidReleaseStateHandlerData {
    context?: Context;
    releaseGroup?: ReleaseGroup | ReleasePackage;
    versionScheme?: VersionScheme;
    bumpType?: VersionBumpType;
    promptWriter?: InstructionalPromptWriter;
    releaseVersion?: string;
    shouldSkipChecks?: boolean;
    shouldCheckPolicy?: boolean;
    shouldCheckBranch?: boolean;
    shouldCheckBranchUpdate?: boolean;
    shouldCommit?: boolean;
    shouldInstall?: boolean;
    shouldCheckMainNextIntegrated?: boolean;
    command?: Command;
    exitFunc?: any;
}

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

            case "CheckInstallBuildTools": {
                result = await checkInstallBuildTools(state, machine, testMode, log, data);
                break;
            }

            case "CheckMainNextIntegrated": {
                result = await checkMainNextIntegrated(state, machine, testMode, log, data);
                break;
            }

            case "CheckReleaseIsDone": {
                result = await checkReleaseIsDone(state, machine, testMode, log, data);
                break;
            }

            case "CheckReleaseGroupIsBumped": {
                result = await checkReleaseGroupIsBumped(state, machine, testMode, log, data);
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

            case "CheckReleaseBranchDoesNotExist": {
                result = await checkReleaseBranchDoesNotExist(state, machine, testMode, log, data);
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
                result = true;
                // result = await promptToCommitChanges(state, machine, testMode, log, data);
                break;
            }

            case "PromptToReleaseDeps": {
                result = await promptToReleaseDeps(state, machine, testMode, log, data);
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
            const superHandled = await super.handleState(state, machine, testMode, log, data);
            return superHandled;
        }

        return true;
    }
}
