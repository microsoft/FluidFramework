/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { CodeSpanNode, PlainTextNode } from "../../documentation-domain";
import { testRender } from "./Utilities";

describe("CodeSpan rendering tests", () => {
	it("Can render an empty CodeSpan", () => {
		expect(testRender(CodeSpanNode.Empty)).to.equal("");
	});

	it("Can render a simple CodeSpan (Markdown)", () => {
		const codeSpanNode = new CodeSpanNode([new PlainTextNode("console.log('hello world');")]);
		const result = testRender(codeSpanNode);

		const expected = "`console.log('hello world');`";

		expect(result).to.equal(expected);
	});

	it("Can render a simple CodeSpan (HTML)", () => {
		const codeSpanNode = new CodeSpanNode([new PlainTextNode("console.log('hello world');")]);
		const result = testRender(codeSpanNode, undefined, { insideHtml: true });

		const expected = "<code>console.log('hello world');</code>";

		expect(result).to.equal(expected);
	});
});
