/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { FencedCodeBlockNode, PlainTextNode } from "../../../documentation-domain";
import { testRender } from "./Utilities";

describe("FencedCodeBlock Markdown rendering tests", () => {
	it("Simple FencedCodeBlock (standard context)", () => {
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

	it("Simple FencedCodeBlock (table context)", () => {
		const input = new FencedCodeBlockNode(
			[new PlainTextNode("console.log('hello world');")],
			"typescript",
		);
		const result = testRender(input, { insideTable: true });

		const expected = ["<code>", "console.log('hello world');", "</code>"].join("");

		expect(result).to.equal(expected);
	});
});
