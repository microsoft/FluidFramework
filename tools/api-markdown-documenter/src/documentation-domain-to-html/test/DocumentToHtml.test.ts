/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ApiItem } from "@microsoft/api-extractor-model";
import { expect } from "chai";
import { h } from "hastscript";

import type { ApiDocument } from "../../ApiDocument.js";
import { documentToHtml } from "../ToHtml.js";

describe("documentToHtml tests", () => {
	it("Renders a simple document", () => {
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

		const result = documentToHtml(document, {});

		const expected = h(undefined, [
			{ type: "doctype" },
			h("html", { lang: "en" }, [
				h("head", [
					// eslint-disable-next-line unicorn/text-encoding-identifier-case
					h("meta", { charset: "utf-8" }),
				]),
				h("body", [
					h("section", [
						h("h1", "Sample Document"),
						h("p", ["This is a sample document. ", "It has very basic content.\t"]),
						h("section", [
							h("h2", "Section Heading"),
							h("p", [
								"This is test inside of a paragraph. ",
								"It is also inside of a hierarchical section node. ",
								h("em", "That's real neat-o."),
							]),
						]),
					]),
				]),
			]),
		]);

		expect(result).to.deep.equal(expected);
	});
});
