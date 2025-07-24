/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import { PlainTextNode, SpanNode } from "../../documentation-domain/index.js";
import { phrasingContentToMarkdown } from "../ToMarkdown.js";
import { createTransformationContext } from "../TransformationContext.js";

describe("spanToMarkdown", () => {
	const transformationContext = createTransformationContext({});

	it("Empty span", () => {
		const input = SpanNode.Empty;
		const result = phrasingContentToMarkdown(input, transformationContext);
		expect(result).to.deep.equal([]);
	});

	it("Italic", () => {
		const input = new SpanNode([new PlainTextNode("Hello world!")], { italic: true });

		const result = phrasingContentToMarkdown(input, transformationContext);
		expect(result).to.deep.equal([
			{ type: "emphasis", children: [{ type: "text", value: "Hello world!" }] },
		]);
	});

	it("Bold", () => {
		const input = new SpanNode([new PlainTextNode("Hello world!")], { bold: true });

		const result = phrasingContentToMarkdown(input, transformationContext);
		expect(result).to.deep.equal([
			{ type: "strong", children: [{ type: "text", value: "Hello world!" }] },
		]);
	});

	it("Strikethrough", () => {
		const input = new SpanNode([new PlainTextNode("Hello world!")], { strikethrough: true });

		const result = phrasingContentToMarkdown(input, transformationContext);
		expect(result).to.deep.equal([
			{ type: "delete", children: [{ type: "text", value: "Hello world!" }] },
		]);
	});

	it("complex", () => {
		const input = new SpanNode(
			[
				new PlainTextNode("Hello "),
				new SpanNode([new PlainTextNode("world!")], { italic: true }),
			],
			{ bold: true, strikethrough: true },
		);

		const result = phrasingContentToMarkdown(input, transformationContext);
		expect(result).to.deep.equal([
			{
				type: "strong",
				children: [
					{
						type: "delete",
						children: [
							{ type: "text", value: "Hello " },
							{
								type: "emphasis",
								children: [{ type: "text", value: "world!" }],
							},
						],
					},
				],
			},
		]);
	});
});
