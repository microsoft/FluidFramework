/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import { CodeSpanNode } from "../../documentation-domain/index.js";
import { phrasingContentToMarkdown } from "../ToMarkdown.js";
import { createTransformationContext } from "../TransformationContext.js";

describe("codeSpanToMarkdown", () => {
	const transformationContext = createTransformationContext({});

	it("Empty code span", () => {
		const input = CodeSpanNode.Empty;
		const result = phrasingContentToMarkdown(input, transformationContext);
		expect(result).to.deep.equal([{ type: "inlineCode", value: "" }]);
	});

	it("Simple code span", () => {
		const input = new CodeSpanNode("const x = 10;");

		const result = phrasingContentToMarkdown(input, transformationContext);
		expect(result).to.deep.equal([{ type: "inlineCode", value: "const x = 10;" }]);
	});
});
