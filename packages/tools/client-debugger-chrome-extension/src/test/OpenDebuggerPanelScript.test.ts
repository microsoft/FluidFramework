/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { isDebuggerPanelOpen } from "../Utilities";

describe("OpenDebuggerPanelScript tests", () => {
	beforeEach(() => {
		document.body.innerHTML = `<div id="test">test</div>`;
	});

	it("Verify that debugger panel is launched by script", () => {
		// Verify that the panel is not live
		expect(isDebuggerPanelOpen()).toBe(false);

		// Execute script
		// eslint-disable-next-line import/no-unassigned-import, @typescript-eslint/no-require-imports
		require("../OpenDebuggerPanelScript");

		// Verify that the panel has been launched
		expect(isDebuggerPanelOpen()).toBe(true);
	});
});
