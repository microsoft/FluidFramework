/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { SharedCounter } from "@fluidframework/counter";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";

import { clientDebugViewClassName } from "@fluid-tools/client-debugger-view";

import { closeDebuggerPanel } from "../CloseDebuggerPanel";
import { debuggerPanelId } from "../Constants";
import { openDebuggerPanel } from "../OpenDebuggerPanel";
import { isDebuggerPanelOpen } from "../Utilities";
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

		initializeFluidClientDebugger(containerInfo);

		document.body.innerHTML = `<div id="test">test</div>`;
	});

	afterEach(() => {
		closeFluidClientDebugger(containerInfo!.containerId);
		containerInfo!.container.dispose();
		containerInfo = undefined;
	});

	it("Debugger only appears after being activated, and has the correct container info upon activation", async () => {
		// Verify the debugger is not visible
		expect(isDebuggerPanelOpen()).toBe(false);

		// Simulate click of extension button
		await openDebuggerPanel();

		// Verify debugger is visible
		expect(isDebuggerPanelOpen()).toBe(true);

		// Validate contents are as expected
		let debuggerPanel = document.querySelector(`#${debuggerPanelId}`);
		expect(debuggerPanel).not.toBeNull();
		expect(debuggerPanel!.childElementCount).toEqual(1); // Should strictly contain debug view

		// Verify that inner debug view is populated.
		// The presence of this particular element also indicates that a debugger instance was found
		// and is being displayed.
		let innerDebugView = document.querySelector(`.${clientDebugViewClassName}`);
		expect(innerDebugView).not.toBeNull();

		// Simulate click of extension button
		await closeDebuggerPanel();

		// Verify debugger is not visible
		expect(isDebuggerPanelOpen()).toBe(false);

		// Verify elements no longer exist on page
		debuggerPanel = document.querySelector(`#${debuggerPanelId}`);
		expect(debuggerPanel).toBeNull();

		innerDebugView = document.querySelector(`.${clientDebugViewClassName}`);
		expect(innerDebugView).toBeNull();
	});
});

/* eslint-enable @typescript-eslint/no-non-null-assertion */
