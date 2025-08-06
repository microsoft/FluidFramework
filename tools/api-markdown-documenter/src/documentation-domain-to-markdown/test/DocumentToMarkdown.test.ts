/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ApiItem } from "@microsoft/api-extractor-model";
import { expect } from "chai";
import type { Root } from "mdast";

import type { ApiDocument } from "../../ApiDocument.js";
import { documentToMarkdown } from "../ToMarkdown.js";

describe("documentToMarkdown", () => {
	it("Transforms a simple document", () => {
		const document: ApiDocument = {
			apiItem: {} as unknown as ApiItem, // Mock ApiItem for testing
			contents: [
				{
					type: "hierarchicalSection",
					children: [
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
							type: "hierarchicalSection",
							children: [
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
							heading: {
								type: "identifiableHeading",
								title: "Section Heading",
							},
						},
					],
					heading: {
						type: "identifiableHeading",
						title: "Sample Document",
					},
				},
			],
			documentPath: "./test",
		};

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
