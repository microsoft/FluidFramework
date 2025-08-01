/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import {
	DocumentNode,
	HeadingNode,
	MarkdownBlockContentNode,
	SectionNode,
} from "../../../documentation-domain/index.js";
import { renderDocument } from "../Render.js";

describe("Document Markdown rendering tests", () => {
	it("Renders a simple document", () => {
		const document = new DocumentNode({
			children: [
				new SectionNode(
					[
						new MarkdownBlockContentNode({
							type: "paragraph",
							children: [
								{
									type: "text",
									value: "This is a sample document. ",
								},
								{
									type: "text",
									value: "It has very basic content.\t",
								},
							],
						}),
						new SectionNode(
							[
								new MarkdownBlockContentNode({
									type: "paragraph",
									children: [
										{
											type: "text",
											value: "This is test inside of a paragraph. ",
										},
										{
											type: "text",
											value: "It is also inside of a hierarchical section node. ",
										},
										{
											type: "emphasis",
											children: [
												{
													type: "text",
													value: "That's real neat-o.",
												},
											],
										},
									],
								}),
							],
							new HeadingNode("Section Heading"),
						),
					],
					new HeadingNode("Sample Document"),
				),
			],
			documentPath: "./test.md",
		});

		const expected = [
			"# Sample Document",
			"",
			"This is a sample document. It has very basic content.&#x9;",
			"",
			"## Section Heading",
			"",
			"This is test inside of a paragraph. It is also inside of a hierarchical section node. _That's real neat-o._",
			"",
		].join("\n");
		expect(renderDocument(document, {})).to.equal(expected);
	});
});
