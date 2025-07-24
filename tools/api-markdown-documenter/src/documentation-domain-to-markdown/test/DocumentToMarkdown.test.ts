/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import type { Root } from "mdast";

import {
	DocumentNode,
	HeadingNode,
	ParagraphNode,
	PlainTextNode,
	SectionNode,
	SpanNode,
} from "../../documentation-domain/index.js";
import { documentToMarkdown } from "../ToMarkdown.js";

describe("documentToMarkdown", () => {
	it("Transforms a simple document", () => {
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
							new HeadingNode("Section Heading"),
						),
					],
					new HeadingNode("Sample Document"),
				),
			],
			documentPath: "./test",
		});

		const result = documentToMarkdown(document, {});

		const expected: Root = {
			type: "root",
			children: [
				{
					type: "heading",
					depth: 1,
					children: [
						{
							type: "text",
							value: "Sample Document",
						},
					],
				},
				{
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
				},
				{
					type: "heading",
					depth: 2,
					children: [
						{
							type: "text",
							value: "Section Heading",
						},
					],
				},
				{
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
				},
			],
		};

		expect(result).to.deep.equal(expected);
	});
});
