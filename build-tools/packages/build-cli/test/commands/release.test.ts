/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// @oclif/test cannot find the path to the project, so as a workaround we configure it explicitly
import { test as oclifTest } from "@oclif/test";
const test = oclifTest.loadConfig({ root: import.meta.url });

import { FluidReleaseMachine } from "../../src/machines/index.js";

const knownUnhandledStates: string[] = [
	// Known unhandled states can be added here temporarily during development.
];

const machineStates = FluidReleaseMachine.states()
	.filter((s) => !knownUnhandledStates.includes(s))
	.sort();

describe("release command handles all states", () => {
	for (const state of machineStates) {
		test
			.stdout()
			.command([
				"release",
				"--releaseGroup",
				"build-tools",
				"--bumpType",
				"patch",
				"--testMode",
				"--state",
				state,
				"--verbose",
			])
			.exit(100)
			.it(`Handles state: '${state}'`, (ctx) => {
				// nothing
			});
	}
});
