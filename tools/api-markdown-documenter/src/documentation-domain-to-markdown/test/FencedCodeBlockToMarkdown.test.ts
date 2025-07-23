/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import { FencedCodeBlockNode } from "../../documentation-domain/index.js";
import { blockContentToMarkdown } from "../ToMarkdown.js";
import { createTransformationContext } from "../TransformationContext.js";

describe("fencedCodeBlockToMarkdown", () => {
	const transformationContext = createTransformationContext({});

	it("Empty code block", () => {
		const input = FencedCodeBlockNode.Empty;
		const result = blockContentToMarkdown(input, transformationContext);
		expect(result).to.deep.equal([{ type: "code", value: "" }]);
	});

	it("Simple code block", () => {
		const input = new FencedCodeBlockNode("const x = 10;\nconsole.log(x);", "javascript");

		const result = blockContentToMarkdown(input, transformationContext);
		expect(result).to.deep.equal([
			{ type: "code", value: "const x = 10;\nconsole.log(x);", lang: "javascript" },
		]);
	});
});
