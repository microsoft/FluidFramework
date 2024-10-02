/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { runCommand } from "@oclif/test";

import { FluidReleaseMachine } from "../../src/machines/index.js";

const knownUnhandledStates: string[] = [
	// Known unhandled states can be added here temporarily during development.
];

const machineStates = FluidReleaseMachine.states()
	.filter((s) => !knownUnhandledStates.includes(s))
	.sort();

describe("release command handles all states", () => {
	for (const state of machineStates) {
		it(`Handles state: '${state}'`, async () => {
			const { error } = await runCommand(
				[
					"release",
					"--releaseGroup",
					"build-tools",
					"--bumpType",
					"patch",
					"--testMode",
					"--state",
					state,
					"--verbose",
				],
				{
					root: import.meta.url,
				},
			);
			expect(error?.oclif?.exit).to.equal(100);
		});
	}
});
