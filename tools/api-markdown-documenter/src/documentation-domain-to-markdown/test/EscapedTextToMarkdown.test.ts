/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import { EscapedTextNode } from "../../documentation-domain/index.js";
import { phrasingContentToMarkdown } from "../ToMarkdown.js";
import { createTransformationContext } from "../TransformationContext.js";

describe("EscapedText to Markdown transformation tests", () => {
	const transformationContext = createTransformationContext({});

	it("Empty text", () => {
		const input = EscapedTextNode.Empty;
		const result = phrasingContentToMarkdown(input, transformationContext);
		const expected = [];
		expect(result).to.deep.equal(expected);
	});

	it("Markdown content", () => {
		const input = new EscapedTextNode("- This is some *markdown* content.");
		const result = phrasingContentToMarkdown(input, transformationContext);
		const expected = [
			{
				type: "list",
				ordered: false,
				children: [
					{
						type: "listItem",
						children: [
							{
								type: "paragraph",
								children: [
									{ type: "text", value: "This is some " },
									{ type: "emphasis", children: [{ type: "text", value: "markdown" }] },
									{ type: "text", value: " content." },
								],
							},
						],
					},
				],
			},
		];
		expect(result).to.deep.equal(expected);
	});
});
