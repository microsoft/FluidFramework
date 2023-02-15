/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { FencedCodeBlockNode, PlainTextNode } from "../../documentation-domain";
import { testRender } from "./Utilities";

describe("FencedCodeBlock markdown tests", () => {
	it("Can render a simple FencedCodeBlock (Markdown)", () => {
		const input = new FencedCodeBlockNode(
			[new PlainTextNode("console.log('hello world');")],
			"typescript",
		);
		const result = testRender(input);

		const expected = ["", "```typescript", "console.log('hello world');", "```", "", ""].join(
			"\n",
		);

		expect(result).to.equal(expected);
	});

	it("Can render a simple FencedCodeBlock (HTML)", () => {
		const input = new FencedCodeBlockNode(
			[new PlainTextNode("console.log('hello world');")],
			"typescript",
		);
		const result = testRender(input, undefined, { insideHtml: true });

		const expected = ["<code>", "  console.log('hello world');", "</code>", ""].join("\n");

		expect(result).to.equal(expected);
	});
});
