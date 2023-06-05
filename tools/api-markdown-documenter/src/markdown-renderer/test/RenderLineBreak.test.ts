/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { LineBreakNode } from "../../documentation-domain";
import { testRender } from "./Utilities";

describe("LineBreak rendering tests", () => {
	it("Markdown", () => {
		// Horizontal Rules always create a leading and trailing line breaks
		expect(testRender(LineBreakNode.Singleton)).to.equal("\n");
	});

	it("HTML", () => {
		expect(testRender(LineBreakNode.Singleton, { insideHtml: true })).to.equal("<br>\n");
	});
});
