/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ApiItem } from "@microsoft/api-extractor-model";
import { expect } from "chai";

import type { NormalizedMarkdownDocument } from "../../../ApiDocument.js";
import { renderDocument } from "../Render.js";

describe("Document HTML rendering tests", () => {
	it("Renders a simple document", () => {
		const document: NormalizedMarkdownDocument = {
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
			"        <p>This is text inside of a paragraph. It is also inside of a hierarchical section node. <em>That's real neat-o.</em></p>",
			"      </section>",
			"    </section>",
			"  </body>",
			"</html>",
			"",
		].join("\n");

		expect(renderDocument(document, { prettyFormatting: true })).to.equal(expected);
	});
});
