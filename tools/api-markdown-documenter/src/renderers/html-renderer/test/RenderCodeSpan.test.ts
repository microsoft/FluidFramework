/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { CodeSpanNode, PlainTextNode } from "../../../documentation-domain/index.js";
import { testRender } from "./Utilities.js";

describe("CodeSpan HTML rendering tests", () => {
	it("Empty CodeSpan", () => {
		expect(testRender(CodeSpanNode.Empty)).to.equal("<code></code>");
	});

	it("Simple CodeSpan", () => {
		const codeSpanNode = new CodeSpanNode([new PlainTextNode("console.log('hello world');")]);
		const result = testRender(codeSpanNode);

		const expected = "<code>console.log('hello world');</code>";

		expect(result).to.equal(expected);
	});
});
