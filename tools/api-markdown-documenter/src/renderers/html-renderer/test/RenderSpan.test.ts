/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import {
	LineBreakNode,
	PlainTextNode,
	SpanNode,
	type TextFormatting,
} from "../../../documentation-domain";
import { testRender } from "./Utilities";

describe("Span HTML rendering tests", () => {
	it("Empty span", () => {
		expect(testRender(SpanNode.Empty)).to.equal("<span></span>");
	});

	it("Simple span", () => {
		const text1 = "This is some text. ";
		const text2 = "This is more text!";
		const node1 = new PlainTextNode(text1);
		const node2 = new PlainTextNode(text2);
		const span = new SpanNode([node1, node2]);
		expect(testRender(span)).to.equal(`<span>${text1}${text2}</span>`);
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
		expect(testRender(span)).to.equal(
			`<span><b><i>This is some text.</i></b> \n<br>\n<b><i>${text2}</i></b></span>`,
		);
	});
});
