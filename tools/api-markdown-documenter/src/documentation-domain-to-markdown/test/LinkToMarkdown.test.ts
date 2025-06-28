/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import { LinkNode } from "../../documentation-domain/index.js";
import { phrasingContentToMarkdown } from "../ToMarkdown.js";
import { createTransformationContext } from "../TransformationContext.js";

it("linkToMarkdown", () => {
	const transformationContext = createTransformationContext({});

	const input = new LinkNode("Hello world!", "https://example.com");
	const result = phrasingContentToMarkdown(input, transformationContext);
	expect(result).to.deep.equal([
		{
			type: "link",
			url: "https://example.com",
			children: [{ type: "text", value: "Hello world!" }],
		},
	]);
});
