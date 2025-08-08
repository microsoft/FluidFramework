/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ApiItem } from "@microsoft/api-extractor-model";
import { expect } from "chai";

import type { MarkdownDocument, RenderedDocument } from "../../../ApiDocument.js";
import { renderDocument } from "../Render.js";

describe("Document Markdown rendering tests", () => {
	it("Renders a simple document", () => {
		const document: MarkdownDocument = {
			apiItem: {} as unknown as ApiItem, // Mock ApiItem for testing
			contents: {
				type: "root",
				children: [
					{
						type: "heading",
						depth: 1,
						children: [{ type: "text", value: "Sample Document" }],
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
						children: [{ type: "text", value: "Section Heading" }],
					},
					{
						type: "paragraph",
						children: [
							{
								type: "text",
								value: "This is text inside of a paragraph. ",
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
			},
			documentPath: "./test",
		};
		const result = renderDocument(document, {});

		const expectedContents = `# Sample Document

This is a sample document. It has very basic content.&#x9;

## Section Heading

This is text inside of a paragraph. It is also inside of a hierarchical section node. _That's real neat-o._
`;
		const expected: RenderedDocument = {
			apiItem: document.apiItem,
			contents: expectedContents,
			filePath: "./test.md",
		};
		expect(result).to.deep.equal(expected);
	});
});
