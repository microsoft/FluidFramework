/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { PlainTextNode, SpanNode } from "../../documentation-domain";
import { DocumentationNodeRenderer } from "../md-transformers";

describe("Span markdown tests", () => {
	it("Renders nothing in an empty span", () => {
		const renderer = new DocumentationNodeRenderer();
		const renderedForm = renderer.renderNode(new SpanNode([]));
		expect(renderedForm).to.equal(``);
	});
	it("Renders plain text nodes", () => {
		const node1 = new PlainTextNode("This is some text. ");
		const node2 = new PlainTextNode("This is more text!");
		const span = new SpanNode([node1, node2]);
		const renderer = new DocumentationNodeRenderer();
		const renderedForm = renderer.renderNode(span);
		expect(renderedForm).to.equal(`This is some text. This is more text!`);
	});

	it("Renders plain text nodes", () => {
		const node1 = new PlainTextNode("This is some text");
		const span = new SpanNode([node1], { bold: true });
		const renderer = new DocumentationNodeRenderer();
		const renderedForm = renderer.renderNode(span);
		expect(renderedForm).to.equal(`<b>This is some text</b>`);
	});
});
