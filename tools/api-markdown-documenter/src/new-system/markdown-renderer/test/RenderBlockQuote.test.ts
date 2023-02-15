/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { BlockQuoteNode, LineBreakNode, PlainTextNode } from "../../documentation-domain";
import { testRender } from "./Utilities";

describe("BlockQuote rendering tests", () => {
	it("Can render an empty BlockQuote", () => {
		expect(testRender(BlockQuoteNode.Empty)).to.equal("");
	});

	it("Can render a simple BlockQuote", () => {
		const blockQuoteNode = new BlockQuoteNode([
			new PlainTextNode("Here's a block quote. "),
			new PlainTextNode("It sure is something!"),
			new LineBreakNode(),
			new LineBreakNode(),
			new PlainTextNode("-BlockQuote"),
		]);
		const result = testRender(blockQuoteNode);

		const expected = [
			"",
			"> Here's a block quote. It sure is something!",
			"> ",
			"> -BlockQuote",
			"",
			"",
		].join("\n");

		expect(result).to.equal(expected);
	});
});
