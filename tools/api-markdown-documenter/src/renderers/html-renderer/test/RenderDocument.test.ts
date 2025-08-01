/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import {
	DocumentNode,
	HeadingNode,
	MarkdownPhrasingContentNode,
	ParagraphNode,
	SectionNode,
	SpanNode,
} from "../../../documentation-domain/index.js";
import { renderDocument } from "../Render.js";

describe("Document HTML rendering tests", () => {
	it("Renders a simple document", () => {
		const document = new DocumentNode({
			children: [
				new SectionNode(
					[
						new ParagraphNode([
							new MarkdownPhrasingContentNode({
								type: "text",
								value: "This is a sample document. ",
							}),
							new MarkdownPhrasingContentNode({
								type: "text",
								value: "It has very basic content.\t",
							}),
						]),
						new SectionNode(
							[
								new ParagraphNode([
									new MarkdownPhrasingContentNode({
										type: "text",
										value: "This is text inside of a paragraph. ",
									}),
									new MarkdownPhrasingContentNode({
										type: "text",
										value: "It is also inside of a hierarchical section node. ",
									}),
									SpanNode.createFromPlainText("That's real neat-o.", {
										italic: true,
									}),
								]),
							],
							new HeadingNode("Section Heading"),
						),
					],
					new HeadingNode("Sample Document"),
				),
			],
			documentPath: "./test",
		});

		const expected = [
			"<!doctype html>",
			'<html lang="en">',
			"  <head>",
			'    <meta charset="utf-8">',
			"  </head>",
			"  <body>",
			"    <section>",
			"      <h1>Sample Document</h1>",
			"      <p>This is a sample document. It has very basic content.</p>",
			"      <section>",
			"        <h2>Section Heading</h2>",
			"        <p>This is text inside of a paragraph. It is also inside of a hierarchical section node. <i>That's real neat-o.</i></p>",
			"      </section>",
			"    </section>",
			"  </body>",
			"</html>",
			"",
		].join("\n");

		expect(renderDocument(document, { prettyFormatting: true })).to.equal(expected);
	});
});
