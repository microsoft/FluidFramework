/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import chai, { expect } from "chai";
import assertArrays from "chai-arrays";
import { FluidReleaseMachine as machine } from "../../src/machines/fluidReleaseMachine";

chai.use(assertArrays);

/**
 * The expected path patch releases will go through. When the state machine is updated these will likely change and need
 * to be updated.
 */
const expectedPatchPath = [
    "DoPatchRelease",
    "CheckDoesReleaseFromReleaseBranch",
    "CheckOnReleaseBranch",
    "CheckReleaseIsDone",
    "CheckReleaseGroupIsBumpedPatch",
    "CheckTypeTestPrepare",
    "CheckTypeTestGenerate",
    "ReleaseComplete",
    "PromptToRunTypeTests",
    "DoReleaseGroupBump",
    "CheckShouldCommitBump",
    "PromptToPRBump",
    "PromptToCommitBump",
    "PromptToRelease",
    "Failed",
];

/**
 * The expected path minor releases will go through. When the state machine is updated these will likely change and need
 * to be updated.
 */
const expectedMinorPath = [
    "DoMinorRelease",
    "CheckDoesReleaseFromReleaseBranch2",
    "CheckOnReleaseBranch2",
    "CheckReleaseGroupIsBumpedPatch2",
    "CheckReleaseIsDone2",
    "CheckReleaseGroupIsBumpedMinor2",
    "CheckTypeTestPrepare2",
    "CheckTypeTestGenerate2",
    "ReleaseComplete",
    "DoReleaseGroupBump",
    "CheckShouldCommitBump",
    "PromptToPRBump",
    "PromptToCommitBump",
    "PromptToRelease",
    "CheckReleaseGroupIsBumpedMinor",
    "CheckReleaseBranchExists",
    "CheckReleaseIsDone",
    "CheckReleaseGroupIsBumpedPatch",
    "CheckTypeTestPrepare",
    "CheckTypeTestGenerate",
    "PromptToRunTypeTests",
    "PromptToCreateReleaseBranch",
];

/**
 * The expected path major releases will go through. When the state machine is updated these will likely change and need
 * to be updated.
 */
const expectedMajorPath = [
    "DoMajorRelease",
    "CheckDoesReleaseFromReleaseBranch3",
    "CheckMainNextIntegrated",
    "CheckReleaseIsDone3",
    "DoMinorRelease",
    "CheckDoesReleaseFromReleaseBranch2",
    "CheckOnReleaseBranch2",
    "CheckReleaseGroupIsBumpedPatch2",
    "CheckReleaseIsDone2",
    "CheckReleaseGroupIsBumpedMinor2",
    "CheckTypeTestPrepare2",
    "CheckTypeTestGenerate2",
    "ReleaseComplete",
    "DoReleaseGroupBump",
    "CheckShouldCommitBump",
    "PromptToPRBump",
    "PromptToCommitBump",
    "PromptToRelease",
    "CheckReleaseGroupIsBumpedMinor",
    "CheckReleaseBranchExists",
    "CheckReleaseIsDone",
    "CheckReleaseGroupIsBumpedPatch",
    "CheckTypeTestPrepare",
    "CheckTypeTestGenerate",
    "PromptToRunTypeTests",
    "PromptToCreateReleaseBranch",
    "CheckOnReleaseBranch3",
    "Failed",
    "CheckBranchName",
    "PromptToIntegrateNext",
];

describe("FluidReleaseMachine", () => {
    it("DoPatchRelease path matches expected", () => {
        const states = new Set<string>();
        const startingState = `DoPatchRelease`;

        walkExits(startingState, states);
        expect([...states]).to.be.equalTo(expectedPatchPath);
    });

    it("DoMinorRelease path matches expected", () => {
        const states = new Set<string>();
        const startingState = `DoMinorRelease`;

        walkExits(startingState, states);
        console.log(JSON.stringify([...states]));
        expect([...states]).to.be.equalTo(expectedMinorPath);
    });

    it("DoMajorRelease path matches expected", () => {
        const states = new Set<string>();
        const startingState = `DoMajorRelease`;
        walkExits(startingState, states);
        console.log(JSON.stringify([...states]));
        expect([...states]).to.be.equalTo(expectedMajorPath);
    });
});

function walkExits(state: string, collector: Set<string>, step = 0): void {
    collector.add(state);
    if (machine.state_is_terminal(state)) {
        return;
    }

    const transitions = machine.list_transitions(state);
    for (const next of transitions.exits) {
        walkExits(next, collector, step++);
    }
}
