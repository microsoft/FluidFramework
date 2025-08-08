/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ApiItem } from "@microsoft/api-extractor-model";
import { expect } from "chai";
import { h } from "hastscript";

import type { MarkdownDocument } from "../../ApiDocument.js";
import { documentToHtml } from "../ToHtml.js";

describe("documentToHtml tests", () => {
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

		const result = documentToHtml(document, {});

		const expected = h(undefined, [
			{ type: "doctype" },
			h("html", { lang: "en" }, [
				h("head", [
					// eslint-disable-next-line unicorn/text-encoding-identifier-case
					h("meta", { charset: "utf-8" }),
				]),
				h("body", [
					h("h1", "Sample Document"),
					{ type: "text", value: "\n" },
					h("p", ["This is a sample document. ", "It has very basic content.\t"]),
					{ type: "text", value: "\n" },
					h("h2", "Section Heading"),
					{ type: "text", value: "\n" },
					h("p", [
						"This is text inside of a paragraph. ",
						"It is also inside of a hierarchical section node. ",
						h("em", "That's real neat-o."),
					]),
				]),
			]),
		]);

		expect(result.contents).to.deep.equal(expected);
	});
});
