/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { ParagraphNode, PlainTextNode } from "../../documentation-domain";
import { testRender } from "./Utilities";

describe("ParagraphNode rendering tests", () => {
	it("Empty paragraph (Markdown)", () => {
		expect(testRender(ParagraphNode.Empty)).to.equal("\n"); // Paragraphs always create a trailing blank line in Markdown
	});

	it("Simple paragraph (Markdown)", () => {
		const text1 = "This is some text. ";
		const text2 = "This is more text!";

		const input = new ParagraphNode([new PlainTextNode(text1), new PlainTextNode(text2)]);
		const result = testRender(input);

		const expected = [`${text1}${text2}`, "", ""].join("\n");
		expect(result).to.equal(expected);
	});

	it("Empty paragraph (HTML)", () => {
		expect(testRender(ParagraphNode.Empty, undefined, { insideHtml: true })).to.equal(
			"<p>\n</p>\n",
		);
	});

	it("Simple paragraph (HTML)", () => {
		const text1 = "This is some text. ";
		const text2 = "This is more text!";

		const input = new ParagraphNode([new PlainTextNode(text1), new PlainTextNode(text2)]);
		const result = testRender(input, undefined, { insideHtml: true });

		const expected = ["<p>", `  ${text1}${text2}`, "</p>", ""].join("\n");
		expect(result).to.equal(expected);
	});
});
