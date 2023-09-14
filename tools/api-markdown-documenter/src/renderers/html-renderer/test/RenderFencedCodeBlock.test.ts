/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { FencedCodeBlockNode, PlainTextNode } from "../../../documentation-domain";
import { testRender } from "./Utilities";

describe("FencedCodeBlock HTML rendering tests", () => {
	it("Simple FencedCodeBlock", () => {
		const input = new FencedCodeBlockNode(
			[new PlainTextNode("console.log('hello world');")],
			"typescript",
		);
		const result = testRender(input);

		const expected = ["<code>", "  console.log('hello world');", "</code>", ""].join("\n");

		expect(result).to.equal(expected);
	});
});
