/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { closeDebuggerPanel } from "../CloseDebuggerPanel";
import { openDebuggerPanel } from "../OpenDebuggerPanel";
import { isDebuggerPanelOpen } from "../Utilities";

describe("CloseDebuggerPanelScript tests", () => {
	beforeEach(async () => {
		document.body.innerHTML = `<div id="test">test</div>`;

		// Launch debugger panel
		await openDebuggerPanel();
	});

	it("Verify that debugger panel is removed by script", async () => {
		// Verify that the panel is live
		expect(isDebuggerPanelOpen()).toBe(true);

		// Execute script
		await closeDebuggerPanel();

		// Verify that the panel has been removed
		expect(isDebuggerPanelOpen()).toBe(false);
	});
});
