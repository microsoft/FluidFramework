/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import {
	DocumentNode,
	HeadingNode,
	ParagraphNode,
	PlainTextNode,
	SectionNode,
	SpanNode,
} from "../../../documentation-domain/index.js";
import { renderDocument } from "../Render.js";

describe("Document Markdown rendering tests", () => {
	it("Renders a simple document", () => {
		const document = new DocumentNode({
			children: [
				new SectionNode(
					[
						new ParagraphNode([
							new PlainTextNode("This is a sample document. "),
							new PlainTextNode("It has very basic content.\t"),
						]),
						new SectionNode(
							[
								new ParagraphNode([
									new PlainTextNode("This is test inside of a paragraph. "),
									new PlainTextNode("It is also inside of a hierarchical section node. "),
									SpanNode.createFromPlainText("That's real neat-o.", {
										italic: true,
									}),
								]),
							],
							HeadingNode.createFromPlainText("Section Heading"),
						),
					],
					HeadingNode.createFromPlainText("Sample Document"),
				),
			],
			documentPath: "./test.md",
		});

		const expected = [
			"# Sample Document",
			"",
			"This is a sample document. It has very basic content.\t",
			"",
			"## Section Heading",
			"",
			"This is test inside of a paragraph. It is also inside of a hierarchical section node. _That's real neat-o._",
			"",
		].join("\n");
		expect(renderDocument(document, {})).to.equal(expected);
	});
});
