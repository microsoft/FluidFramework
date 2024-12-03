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

describe("BlockQuote Markdown rendering tests", () => {
	describe("Standard context", () => {
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

	describe("Table context", () => {
		it("Empty BlockQuote", () => {
			expect(testRender(BlockQuoteNode.Empty, { insideTable: true })).to.equal(
				"<blockquote></blockquote>",
			);
		});

		it("Simple BlockQuote", () => {
			const blockQuoteNode = new BlockQuoteNode([
				new PlainTextNode("Here's a block quote. "),
				new PlainTextNode("It sure is something!"),
				new LineBreakNode(),
				new PlainTextNode("-BlockQuote"),
			]);
			const result = testRender(blockQuoteNode, { insideTable: true });

			const expected = [
				"<blockquote>",
				"Here's a block quote. It sure is something!",
				"<br>",
				"-BlockQuote",
				"</blockquote>",
			].join("");

			expect(result).to.equal(expected);
		});
	});
});
