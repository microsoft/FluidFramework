/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { debuggerPanelId } from "../Constants";

describe("CloseDebuggerPanelScript tests", () => {
	beforeEach(() => {
		document.body.innerHTML = `<div id="test">test</div>`;

		// Launch debugger panel
		// eslint-disable-next-line import/no-unassigned-import, @typescript-eslint/no-require-imports
		require("../OpenDebuggerPanelScript");
	});

	it("Verify that debugger panel is removed by script", () => {
		// Verify that the panel is live
		let debuggerPanel = document.querySelector(`#${debuggerPanelId}`);
		expect(debuggerPanel).not.toBeNull();

		// Execute script
		// eslint-disable-next-line import/no-unassigned-import, @typescript-eslint/no-require-imports
		require("../CloseDebuggerPanelScript");

		// Verify that the panel has been removed
		debuggerPanel = document.querySelector(`#${debuggerPanelId}`);
		expect(debuggerPanel).toBeNull();
	});
});
