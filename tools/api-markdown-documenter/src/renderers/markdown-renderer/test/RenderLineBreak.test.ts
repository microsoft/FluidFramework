/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import { LineBreakNode } from "../../../documentation-domain/index.js";

import { testRender } from "./Utilities.js";

describe("LineBreak Markdown rendering tests", () => {
	it("Standard context", () => {
		// Horizontal Rules always create a leading and trailing line breaks
		expect(testRender(LineBreakNode.Singleton)).to.equal("\n");
	});

	it("Table context", () => {
		expect(testRender(LineBreakNode.Singleton, { insideTable: true })).to.equal("<br>");
	});
});
