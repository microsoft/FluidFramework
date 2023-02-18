/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { BlockQuoteNode, LineBreakNode, PlainTextNode } from "../../documentation-domain";
import { testRender } from "./Utilities";

describe("BlockQuote rendering tests", () => {
	describe("Markdown", () => {
		it("Empty BlockQuote", () => {
			expect(testRender(BlockQuoteNode.Empty)).to.equal("\n");
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

	describe("HTML", () => {
		it("Empty BlockQuote", () => {
			expect(testRender(BlockQuoteNode.Empty, { insideHtml: true })).to.equal(
				"<blockquote>\n</blockquote>\n",
			);
		});

		it("Simple BlockQuote", () => {
			const blockQuoteNode = new BlockQuoteNode([
				new PlainTextNode("Here's a block quote. "),
				new PlainTextNode("It sure is something!"),
				new LineBreakNode(),
				new PlainTextNode("-BlockQuote"),
			]);
			const result = testRender(blockQuoteNode, { insideHtml: true });

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
});
