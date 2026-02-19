/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import {
	errorMessage,
	lookForTabs,
} from "../../../library/repoPolicyCheck/spacesOverTabsInYaml.js";

describe("indent-with-spaces-in-yaml", () => {
	it("does not fail when no tabs are present", () => {
		const error = lookForTabs(`
no indentation
  indented with spaces`);
		expect(error).to.equal(undefined);
	});

	it("fails when tabs are present at the start of a line", () => {
		const error = lookForTabs(`
no indentation
	indented with tabs`);
		expect(error).to.equal(errorMessage);
	});

	it("fails when tabs are present after spaces but before text", () => {
		const error = lookForTabs(`
no indentation
  	indented with spaces followed by tabs`);
		expect(error).to.equal(errorMessage);
	});

	it("ignores tabs after first character in line", () => {
		const error = lookForTabs(`
no indentation
  indented with spaces but there's a tab	in the middle of line`);
		expect(error).to.equal(undefined);
	});
});
