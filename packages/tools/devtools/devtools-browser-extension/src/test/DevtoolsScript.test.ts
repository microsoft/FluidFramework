/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import { createSandbox } from "sinon";

// Allow directly importing the content which this test suite is testing:
// eslint-disable-next-line import/no-internal-modules
import { runDevtoolsScript } from "../devtools/DevtoolsScriptContent.js";

import { stubGlobals } from "./Utilities.js";

describe("Devtools Script unit tests", () => {
	it("Creates the view on load", async () => {
		const sandbox = createSandbox();
		const { browser } = stubGlobals();
		const createSpy = sandbox.spy(browser.devtools.panels, "create");
		runDevtoolsScript(browser);
		expect(createSpy.called).to.be.true;
	});
});
