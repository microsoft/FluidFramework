/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import type { Text as MdastText } from "mdast";

import {
	DocumentationLiteralNodeBase,
	type PhrasingContent,
} from "../../documentation-domain/index.js";
import { phrasingContentToMarkdown } from "../ToMarkdown.js";
import {
	createTransformationContext,
	type TransformationContext,
} from "../TransformationContext.js";

/**
 * Mock custom {@link DocumentationNode} for use in the tests below.
 */
class CustomDocumentationNode extends DocumentationLiteralNodeBase<string> {
	public static readonly type = "custom";
	public readonly type = CustomDocumentationNode.type;
	public readonly singleLine: boolean = false;
	public readonly isEmpty: boolean = false;
	public constructor(value: string) {
		// Reverse the input string
		super([...value].reverse().join(""));
	}
}

/**
 * Mock custom renderer for {@link CustomDocumentationNode}.
 */
function customDocumentationNodeToMarkdown(
	node: CustomDocumentationNode,
	context: TransformationContext,
): [MdastText] {
	return [
		{
			type: "text",
			value: node.value,
		},
	];
}

// The following are testing our support for custom DocumentationNode implementations.
// Assuming an appropriate renderer is supplied, the system should be able to handle them correctly.
describe("Custom node Markdown transformation tests", () => {
	it("Can transform a custom node type when a transform is specified for that kind of node", () => {
		const context = createTransformationContext({
			customTransformations: {
				// @ts-expect-error - Using our standard extensibility model within the package causes issues.
				custom: customDocumentationNodeToMarkdown,
			},
		});

		const input = new CustomDocumentationNode("foo");

		// Using our standard extensibility model within the package causes issues, hence the cast here.
		const output = phrasingContentToMarkdown(input as unknown as PhrasingContent, context);

		expect(output).to.deep.equal([{ type: "text", value: "oof" }]);
	});

	it("Throws while transforming a custom node type when no transform is specified for that kind of node", () => {
		const context = createTransformationContext({});

		const input = new CustomDocumentationNode("foo");

		expect(() =>
			// Using our standard extensibility model within the package causes issues, hence the cast here.
			phrasingContentToMarkdown(input as unknown as PhrasingContent, context),
		).to.throw(/No transformation defined for node type: custom/);
	});
});
