/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { HorizontalRuleNode } from "../../../documentation-domain";
import { testRender } from "./Utilities";

describe("HorizontalRule Markdown rendering tests", () => {
	it("Markdown context", () => {
		// Horizontal Rules always create a leading and trailing line breaks
		expect(testRender(HorizontalRuleNode.Singleton)).to.equal("\n---\n\n");
	});

	it("HTML context", () => {
		expect(testRender(HorizontalRuleNode.Singleton, { insideHtml: true })).to.equal("<hr>\n");
	});
});
