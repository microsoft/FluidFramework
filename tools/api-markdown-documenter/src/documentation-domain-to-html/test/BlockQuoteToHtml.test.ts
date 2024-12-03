/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { h } from "hastscript";

import { BlockQuoteNode, LineBreakNode, PlainTextNode } from "../../documentation-domain/index.js";

import { assertTransformation } from "./Utilities.js";

describe("BlockQuote HTML rendering tests", () => {
	it("Empty BlockQuote", () => {
		assertTransformation(BlockQuoteNode.Empty, h("blockquote"));
	});

	it("Simple BlockQuote", () => {
		const input = new BlockQuoteNode([
			new PlainTextNode("Here's a block quote. "),
			new PlainTextNode("It sure is something!"),
			new LineBreakNode(),
			new PlainTextNode("-BlockQuote"),
		]);

		const expected = h("blockquote", [
			"Here's a block quote. ",
			"It sure is something!",
			h("br"),
			"-BlockQuote",
		]);
		assertTransformation(input, expected);
	});
});
