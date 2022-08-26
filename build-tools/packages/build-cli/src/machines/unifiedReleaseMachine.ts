/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { sm } from "jssm";
import { StateMachine } from "./machines";

/**
 * The state machine definitions in this file are written in Finite State Language (FSL), which is documented at
 * {@link https://fsl.tools/}.
 *
 * They can be visualized using the browser-based tool at
 * {@link https://stonecypher.github.io/jssm-viz-demo/graph_explorer.html}. Just copy/paste the FSL string for the
 * machine into the editor.
 */

/**
 * An FSL state machine that encodes the Fluid release process.
 *
 * @alpha
 */
export const UnifiedReleaseMachineDefinition = sm`
machine_name: "Fluid Unified Release Process";

Init 'success'
=> DoChecks;

Init 'failure'
=> Failed;

// DoChecks
DoChecks 'success'
=> CheckShouldRunOptionalChecks 'success'
=> CheckValidReleaseGroup 'success'
=> CheckPolicy 'success'
=> CheckHasRemote 'success'
=> CheckBranchUpToDate 'success'
=> CheckNoPrereleaseDependencies 'success'
=> AskReleaseDetails 'success'
=> CheckForReleaseType;

[
CheckValidReleaseGroup
CheckPolicy
CheckHasRemote
CheckBranchUpToDate
] 'failure' => Failed;

// ChecksDone
CheckForReleaseType 'patch'
=> DoPatchRelease;

CheckForReleaseType 'minor'
=> DoMinorRelease;

CheckForReleaseType 'major'
=> DoMajorRelease;

[
DoPatchRelease
DoMinorRelease
DoMajorRelease
] 'success'
=> CheckBranchName 'success'
=> CheckMainNextIntegrated 'success'
=> CheckReleaseIsDone 'success'
=> CheckReleaseGroupIsNotBumped 'success'
=> DoReleaseGroupBump;

CheckMainNextIntegrated 'failure'
=> PromptToIntegrateNext;

CheckReleaseIsDone 'failure'
=> PromptToRelease;

CheckReleaseGroupIsNotBumped 'failure'
=> CheckNoPrereleaseDependencies3;

CheckBranchName 'failure'
=> CheckReleaseBranchDoesNotExist 'success' // No release branch found
=> PromptToRelease;

CheckReleaseBranchDoesNotExist 'failure'
=> Failed;

CheckNoPrereleaseDependencies 'failure'
// for DoBumpReleasedDependencies, success means that there were none to bump
// failure means there were bumps and thus local changes that need to be merged
=> DoBumpReleasedDependencies;

// DoBumpReleasedDependencies
DoBumpReleasedDependencies 'success' // No dependencies to bump
=> CheckNoPrereleaseDependencies2 'success'
=> CheckShouldCommitDeps 'success'
=> PromptToPRDeps;

DoBumpReleasedDependencies 'failure' // Dependencies were bumped
=> CheckNoPrereleaseDependencies3 'failure'
=> PromptToReleaseDeps;

DoBumpReleasedDependencies
~> Failed;

// DoReleaseGroupBump
DoReleaseGroupBump 'success'
=> CheckShouldCommitBump 'success'
=> PromptToPRBump;

CheckShouldRunOptionalChecks 'failure'
=> CheckNoPrereleaseDependencies;

CheckShouldCommitBump 'failure'
=> PromptToCommitBump;

CheckShouldCommitDeps 'failure'
=> PromptToCommitDeps;

CheckNoPrereleaseDependencies3 'success'
=> CheckShouldCommitReleasedDepsBump 'success'
=> PromptToPRReleasedDepsBump;

CheckNoPrereleaseDependencies2 'failure'
=> PromptToReleaseDeps;

CheckShouldCommitReleasedDepsBump 'failure'
=> PromptToCommitReleasedDepsBump;


// visual styling
state DoReleaseGroupBump: {
   background-color : steelblue;
   text-color       : white;
};

state DoBumpReleasedDependencies: {
   background-color : steelblue;
   text-color       : white;
};

state DoChecks: {
   background-color : steelblue;
   text-color       : white;
};

// state PromptToCommitReleasedDepsBump: {
//   background-color : #ffdddd;
//   text-color       : black;
// };

state AskReleaseDetails: {
   background-color : purple;
   text-color       : white;
};
`;

export const UnifiedReleaseMachine: StateMachine = {
    knownActions: ["success", "failure", "patch", "minor", "major"],
    knownStates: [
        "Init",
        "DoChecks",
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
        "PromptToPRReleasedDepsBump",
        "PromptToRelease",
        "PromptToReleaseDeps",
    ],
    machine: UnifiedReleaseMachineDefinition,
};
