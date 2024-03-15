/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BlockQuoteNode, LineBreakNode, PlainTextNode } from "../../documentation-domain/index.js";
import { assertExpectedHtml } from "./Utilities.js";

describe("BlockQuote HTML rendering tests", () => {
	it("Empty BlockQuote", () => {
		assertExpectedHtml(BlockQuoteNode.Empty, "<blockquote />");
	});

	it("Simple BlockQuote", () => {
		const blockQuoteNode = new BlockQuoteNode([
			new PlainTextNode("Here's a block quote. "),
			new PlainTextNode("It sure is something!"),
			new LineBreakNode(),
			new PlainTextNode("-BlockQuote"),
		]);

		assertExpectedHtml(
			blockQuoteNode,
			"<blockquote>Here's a block quote. It sure is something!<br>-BlockQuote</blockquote>",
		);
	});
});
