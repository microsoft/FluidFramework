/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { isDebuggerPanelOpen } from "../Utilities";

describe("CloseDebuggerPanelScript tests", () => {
	beforeEach(() => {
		document.body.innerHTML = `<div id="test">test</div>`;

		// Launch debugger panel
		// eslint-disable-next-line import/no-unassigned-import, @typescript-eslint/no-require-imports
		require("../OpenDebuggerPanelScript");
	});

	it("Verify that debugger panel is removed by script", () => {
		// Verify that the panel is live
		expect(isDebuggerPanelOpen()).toBe(true);

		// Execute script
		// eslint-disable-next-line import/no-unassigned-import, @typescript-eslint/no-require-imports
		require("../CloseDebuggerPanelScript");

		// Verify that the panel has been removed
		expect(isDebuggerPanelOpen()).toBe(false);
	});
});
