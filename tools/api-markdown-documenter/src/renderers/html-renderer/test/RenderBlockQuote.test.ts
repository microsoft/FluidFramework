/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import {
	BlockQuoteNode,
	LineBreakNode,
	PlainTextNode,
} from "../../../documentation-domain/index.js";
import { testRender } from "./Utilities.js";

describe("BlockQuote HTML rendering tests", () => {
	it("Empty BlockQuote", () => {
		expect(testRender(BlockQuoteNode.Empty)).to.equal("<blockquote>\n</blockquote>\n");
	});

	it("Simple BlockQuote", () => {
		const blockQuoteNode = new BlockQuoteNode([
			new PlainTextNode("Here's a block quote. "),
			new PlainTextNode("It sure is something!"),
			new LineBreakNode(),
			new PlainTextNode("-BlockQuote"),
		]);
		const result = testRender(blockQuoteNode);

		const expected = [
			"<blockquote>",
			"  Here's a block quote. It sure is something!",
			"  <br>",
			"  -BlockQuote",
			"</blockquote>",
			"",
		].join("\n");

		expect(result).to.equal(expected);
	});
});
