/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import { PlainTextNode } from "../../documentation-domain/index.js";
import { phrasingContentToMarkdown } from "../ToMarkdown.js";
import { createTransformationContext } from "../TransformationContext.js";

describe("plainTextToMarkdown", () => {
	const transformationContext = createTransformationContext({});

	it("Empty plain text", () => {
		const input = PlainTextNode.Empty;
		const result = phrasingContentToMarkdown(input, transformationContext);
		expect(result).to.deep.equal([{ type: "text", value: "" }]);
	});

	it("Simple plain text", () => {
		const input = new PlainTextNode("Hello world!");

		const result = phrasingContentToMarkdown(input, transformationContext);
		expect(result).to.deep.equal([{ type: "text", value: "Hello world!" }]);
	});
});
