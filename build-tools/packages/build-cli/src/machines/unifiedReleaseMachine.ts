/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "path";
import { FileSystem as fs } from "@rushstack/node-core-library";
import { from as createStateMachine } from "jssm";
import { StateMachine } from "./types";

// eslint-disable-next-line unicorn/prefer-module
const machineDefinitionFile = path.join(__dirname, "FluidUnifiedRelease.fsl");
const f = fs.readFile(machineDefinitionFile).toString();

/**
 * An FSL state machine that encodes the Fluid release process.
 *
 * @alpha
 */
export const UnifiedReleaseMachineDefinition = createStateMachine(f);

export const UnifiedReleaseMachine: StateMachine = {
    machine: UnifiedReleaseMachineDefinition,
    handleState: async (state: string): Promise<boolean> => {
        // TODO: Will be replaced in future change.
        return false;
    },
    knownActions: ["success", "failure", "patch", "minor", "major"],
    knownStates: [
        "Init",
        "Failed",
        "AskReleaseDetails",
        "CheckBranchUpToDate",
        "CheckForReleaseType",
        "CheckHasRemote",
        "CheckNoPrereleaseDependencies",
        "CheckNoPrereleaseDependencies2",
        "CheckNoPrereleaseDependencies3",
        "CheckPolicy",
        "CheckReleaseGroupIsNotBumped",
        "CheckShouldRunOptionalChecks",
        "CheckValidReleaseGroup",
        "DoChecks",
        "DoPatchRelease",
        "CheckBranchName",
        "CheckMainNextIntegrated",
        "CheckReleaseBranchDoesNotExist",
        "CheckReleaseIsDone",
        "CheckShouldCommitBump",
        "CheckShouldCommitBump",
        "CheckShouldCommitDeps",
        "CheckShouldCommitDeps",
        "CheckShouldCommitReleasedDepsBump",
        "DoBumpReleasedDependencies",
        "DoMajorRelease",
        "DoMinorRelease",
        "DoReleaseGroupBump",
        "PromptToCommitBump",
        "PromptToCommitDeps",
        "PromptToCommitReleasedDepsBump",
        "PromptToIntegrateNext",
        "PromptToPRBump",
        "PromptToPRDeps",
        // "PromptToPRReleasedDepsBump",
        "PromptToRelease",
        "PromptToReleaseDeps",
    ],
};
