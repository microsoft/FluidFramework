/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	LineBreakNode,
	PlainTextNode,
	SpanNode,
	type TextFormatting,
} from "../../documentation-domain/index.js";
import { assertExpectedHtml } from "./Utilities.js";

describe("Span HTML rendering tests", () => {
	it("Empty span", () => {
		assertExpectedHtml(SpanNode.Empty, "<span />");
	});

	it("Simple span", () => {
		const text1 = "This is some text. ";
		const text2 = "This is more text!";
		const node1 = new PlainTextNode(text1);
		const node2 = new PlainTextNode(text2);
		const span = new SpanNode([node1, node2]);
		assertExpectedHtml(span, `<span>${text1}${text2}</span>`);
	});

	it("Formatted span", () => {
		const formatting: TextFormatting = {
			bold: true,
			italic: true,
		};
		const text1 = "This is some text. ";
		const text2 = "This is more text!";
		const node1 = new PlainTextNode(text1);
		const node2 = LineBreakNode.Singleton;
		const node3 = new PlainTextNode(text2);
		const span = new SpanNode([node1, node2, node3], formatting);
		assertExpectedHtml(span, `<span><b><i>${text1}<br>${text2}</i></b></span>`);
	});

	it("Nested spans with formatting", () => {
		const text1 = "This is some text. ";
		const text2 = "This is more text!";
		const node1 = new PlainTextNode(text1);
		const node2 = LineBreakNode.Singleton;
		const node3 = new PlainTextNode(text2);
		const span = new SpanNode(
			[
				node1,
				new SpanNode([node2, node3], {
					bold: true,
					italic: true,
				}),
			],
			{ strikethrough: true },
		);
		assertExpectedHtml(
			span,
			`<span><s>${text1}<span><b><i><br>${text2}</i></b></span></s></span>`,
		);
	});
});
