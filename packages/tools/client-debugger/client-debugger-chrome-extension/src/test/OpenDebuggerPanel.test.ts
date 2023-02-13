/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { openDebuggerPanel } from "../OpenDebuggerPanel";
import { isDebuggerPanelOpen } from "../Utilities";

describe("OpenDebuggerPanelScript tests", () => {
	beforeEach(() => {
		document.body.innerHTML = `<div id="test">test</div>`;
	});

	it("Verify that debugger panel is launched by script", async () => {
		// Verify that the panel is not live
		expect(isDebuggerPanelOpen()).toBe(false);

		// Execute script
		await openDebuggerPanel();

		// Verify that the panel has been launched
		expect(isDebuggerPanelOpen()).toBe(true);
	});
});
