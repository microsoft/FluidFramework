/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { SharedCounter } from "@fluidframework/counter";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";

import {
	ContainerInfo,
	closeFluidClientDebugger,
	createFluidContainer,
	initializeFluidClientDebugger,
} from "./ClientUtilities";

/* eslint-disable @typescript-eslint/no-non-null-assertion */

describe("Debugger Browser Extension tests", () => {
	let containerInfo: ContainerInfo | undefined;
	beforeEach(async () => {
		const client = new TinyliciousClient();
		containerInfo = await createFluidContainer(client, {
			initialObjects: {
				counter: SharedCounter,
			},
			dynamicObjectTypes: [SharedCounter],
		});

		document.body.innerHTML = `<div id="test">test</div>`;
		initializeFluidClientDebugger(containerInfo);
	});

	afterEach(async () => {
		closeFluidClientDebugger(containerInfo!.containerId);
	});

	it("Debugger only appears after being activated, and has the correct container info upon activation", () => {
		// Verify the debugger is not visible
		// Simulate click of extension button
		// Verify debugger is visible
		// Simulate click of extension button
		// Verify debugger is not visible
		expect(true).toBe(true); // TODO
	});
});

/* eslint-enable @typescript-eslint/no-non-null-assertion */
