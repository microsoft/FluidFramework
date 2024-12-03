/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { h } from "hastscript";

import {
	LineBreakNode,
	PlainTextNode,
	SpanNode,
	type TextFormatting,
} from "../../documentation-domain/index.js";

import { assertTransformation } from "./Utilities.js";

describe("Span to HTML transformation tests", () => {
	it("Empty span", () => {
		assertTransformation(SpanNode.Empty, h("span"));
	});

	it("Simple span", () => {
		const text1 = "This is some text. ";
		const text2 = "This is more text!";
		const node1 = new PlainTextNode(text1);
		const node2 = new PlainTextNode(text2);

		const span = new SpanNode([node1, node2]);
		const expected = h("span", [text1, text2]);
		assertTransformation(span, expected);
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
		const expected = h("span", [h("b", [h("i", [text1])]), h("br"), h("b", [h("i", [text2])])]);
		assertTransformation(span, expected);
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
					strikethrough: false,
				}),
			],
			{ strikethrough: true },
		);

		const expected = h("span", [h("s", [text1]), h("span", [h("br"), h("b", [text2])])]);

		assertTransformation(span, expected);
	});
});
