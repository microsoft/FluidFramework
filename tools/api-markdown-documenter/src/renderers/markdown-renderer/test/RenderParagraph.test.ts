/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import { ParagraphNode, PlainTextNode } from "../../../documentation-domain/index.js";

import { testRender } from "./Utilities.js";

describe("ParagraphNode Markdown rendering tests", () => {
	describe("Standard context", () => {
		it("Empty paragraph", () => {
			expect(testRender(ParagraphNode.Empty)).to.equal("\n"); // Paragraphs always create a trailing blank line in Markdown
		});

		it("Simple paragraph", () => {
			const text1 = "This is some text. ";
			const text2 = "This is more text!";

			const input = new ParagraphNode([new PlainTextNode(text1), new PlainTextNode(text2)]);
			const result = testRender(input);

			const expected = [`${text1}${text2}`, "", ""].join("\n");
			expect(result).to.equal(expected);
		});
	});

	describe("Table context", () => {
		it("Empty paragraph", () => {
			expect(testRender(ParagraphNode.Empty, { insideTable: true })).to.equal("<p></p>");
		});

		it("Simple paragraph", () => {
			const text1 = "This is some text. ";
			const text2 = "This is more text!";

			const input = new ParagraphNode([new PlainTextNode(text1), new PlainTextNode(text2)]);
			const result = testRender(input, { insideTable: true });

			const expected = ["<p>", `${text1}${text2}`, "</p>"].join("");
			expect(result).to.equal(expected);
		});
	});
});
