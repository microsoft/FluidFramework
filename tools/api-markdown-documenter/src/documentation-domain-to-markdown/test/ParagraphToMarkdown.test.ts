/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import { ParagraphNode, PlainTextNode } from "../../documentation-domain/index.js";
import { blockContentToMarkdown } from "../ToMarkdown.js";
import { createTransformationContext } from "../TransformationContext.js";

describe("paragraphToMarkdown", () => {
	const transformationContext = createTransformationContext({});

	it("Empty paragraph", () => {
		const input = ParagraphNode.Empty;
		const result = blockContentToMarkdown(input, transformationContext);
		expect(result).to.deep.equal([{ type: "paragraph", children: [] }]);
	});

	it("Simple paragraph", () => {
		const text1 = "This is some text. ";
		const text2 = "This is more text!";

		const input = new ParagraphNode([new PlainTextNode(text1), new PlainTextNode(text2)]);
		const result = blockContentToMarkdown(input, transformationContext);
		expect(result).to.deep.equal([
			{
				type: "paragraph",
				children: [
					{ type: "text", value: text1 },
					{ type: "text", value: text2 },
				],
			},
		]);
	});
});
