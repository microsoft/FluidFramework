/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { debuggerPanelId } from "../Constants";
import { isDebuggerPanelOpen } from "../Utilities";

/* eslint-disable @typescript-eslint/no-non-null-assertion */

describe("Debugger Browser Extension tests", () => {
	beforeEach(async () => {
		document.body.innerHTML = `<div id="test">test</div>`;
	});

	it("Debugger only appears after being activated, and has the correct container info upon activation", async () => {
		// Verify the debugger is not visible
		expect(isDebuggerPanelOpen()).toBe(false);

		// Simulate click of extension button
		// TODO

		// Verify debugger is visible
		expect(isDebuggerPanelOpen()).toBe(true);

		// Validate contents are as expected
		let debuggerPanel = document.querySelector(`#${debuggerPanelId}`);
		expect(debuggerPanel).not.toBeNull();
		expect(debuggerPanel!.childElementCount).toEqual(1); // Should strictly contain debug view

		// Simulate click of extension button
		// TODO

		// Verify debugger is not visible
		expect(isDebuggerPanelOpen()).toBe(false);

		// Verify elements no longer exist on page
		debuggerPanel = document.querySelector(`#${debuggerPanelId}`);
		expect(debuggerPanel).toBeNull();
	});
});

/* eslint-enable @typescript-eslint/no-non-null-assertion */
