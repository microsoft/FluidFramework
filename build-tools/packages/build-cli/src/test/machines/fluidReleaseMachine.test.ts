/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { describe, expect, it } from "vitest";

import { FluidReleaseMachine as machine } from "../../machines/fluidReleaseMachine.js";

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
	"PromptToRunTypeTests",
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
	"PromptToRunTypeTests",
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
		expect([...states]).to.deep.equal(expectedPatchPath);
	});

	it("DoMinorRelease path matches expected", () => {
		const states = new Set<string>();
		const startingState = `DoMinorRelease`;

		walkExits(startingState, states);
		expect([...states]).to.deep.equal(expectedMinorPath);
	});

	it("DoMajorRelease path matches expected", () => {
		const states = new Set<string>();
		const startingState = `DoMajorRelease`;
		walkExits(startingState, states);
		expect([...states]).to.deep.equal(expectedMajorPath);
	});

	describe("All states with a success action have a failure action", () => {
		// Do* actions are not required to have a failure action except those in this array
		const requiresBothActions = new Set(["DoBumpReleasedDependencies"]);

		const states = new Set<string>();
		// eslint-disable-next-line unicorn/no-array-for-each
		machine.list_states_having_action("success").forEach((v) => states.add(v));
		// eslint-disable-next-line unicorn/no-array-for-each
		machine.list_states_having_action("failure").forEach((v) => states.add(v));

		for (const state of states) {
			const exits = machine.list_exit_actions(state).sort();

			if (!state.startsWith("Do") || requiresBothActions.has(state)) {
				it(state, () => {
					// eslint-disable-next-line unicorn/no-array-for-each
					["failure", "success"].forEach((item) => expect(exits).toContain(item));
				});
			} else {
				// Do* actions are not required to have a failure action
				it(state, () => {
					expect(exits).toContain("success");
					expect(exits).toHaveLength(1);
				});
			}
		}
	});
});

/**
 * Recursively follows exit transitions from each state until reaching a terminal state.
 */
function walkExits(state: string, collector: Set<string>, step = 0): void {
	collector.add(state);
	if (machine.state_is_terminal(state)) {
		return;
	}

	const transitions = machine.list_transitions(state);
	for (const next of transitions.exits) {
		walkExits(next, collector, step + 1);
	}
}
