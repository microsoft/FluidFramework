/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { h } from "hastscript";

import type { Section } from "../../mdast/index.js";

import { assertTransformation } from "./Utilities.js";

describe("HierarchicalSection HTML rendering tests", () => {
	it("Simple section", () => {
		const input: Section = {
			type: "section",
			children: [
				{
					type: "paragraph",
					children: [{ type: "text", value: "Foo" }],
				},
				{
					type: "thematicBreak",
				},
				{
					type: "paragraph",
					children: [{ type: "text", value: "Bar" }],
				},
			],
			heading: {
				type: "sectionHeading",
				title: "Hello World",
				id: "heading-id",
			},
		};

		const expected = h("section", [
			h("h1", { id: "heading-id" }, "Hello World"),
			h("p", "Foo"),
			h("hr"),
			h("p", "Bar"),
		]);

		assertTransformation(input, expected);
	});

	it("Nested section", () => {
		const input: Section = {
			type: "section",
			children: [
				{
					type: "section",
					children: [
						{
							type: "paragraph",
							children: [{ type: "text", value: "Foo" }],
						},
					],
					heading: {
						type: "sectionHeading",
						title: "Sub-Heading 1",
						id: "sub-heading-1",
					},
				},

				{
					type: "section",
					children: [
						{
							type: "section",
							children: [
								{
									type: "paragraph",
									children: [{ type: "text", value: "Bar" }],
								},
							],
							heading: {
								type: "sectionHeading",
								title: "Sub-Heading 2b",
							},
						},
					],
				},
			],
			heading: {
				type: "sectionHeading",
				title: "Root Heading",
				id: "root-heading",
			},
		};

		const expected = h("section", [
			h("h1", { id: "root-heading" }, "Root Heading"),
			h("section", [h("h2", { id: "sub-heading-1" }, "Sub-Heading 1"), h("p", "Foo")]),
			h("section", [h("section", [h("h3", "Sub-Heading 2b"), h("p", "Bar")])]),
		]);

		assertTransformation(input, expected);
	});
});
