/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import { HorizontalRuleNode } from "../../../documentation-domain/index.js";

import { testRender } from "./Utilities.js";

describe("HorizontalRule Markdown rendering tests", () => {
	it("Standard context", () => {
		// Horizontal Rules always create a leading and trailing line breaks
		expect(testRender(HorizontalRuleNode.Singleton)).to.equal("\n---\n\n");
	});

	it("Table context", () => {
		expect(testRender(HorizontalRuleNode.Singleton, { insideTable: true })).to.equal("<hr>");
	});
});
