/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";
import type { Text as MdastText } from "mdast";

import { DocumentationLiteralNodeBase } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";

import { testTransformation } from "./Utilities.js";

/**
 * Mock custom {@link DocumentationNode} for use in the tests below.
 */
class CustomDocumentationNode extends DocumentationLiteralNodeBase<string> {
	public static readonly type = "custom";
	public readonly type = CustomDocumentationNode.type;
	public readonly singleLine: boolean = false;
	public readonly isEmpty: boolean = false;
	public constructor(value: string) {
		super(value);
	}
}

/**
 * Mock custom renderer for {@link CustomDocumentationNode}.
 */
function customDocumentationNodeToMarkdown(
	node: CustomDocumentationNode,
	context: TransformationContext,
): [MdastText] {
	return [{ type: "text", value: `${node.value}!` }];
}

// The following are testing our support for custom DocumentationNode implementations.
// Assuming an appropriate renderer is supplied, the system should be able to handle them correctly.
describe("Custom node HTML rendering tests", () => {
	it("Can render a custom node type when given a renderer", () => {
		const input = new CustomDocumentationNode("foo");
		const result = testTransformation(input, {
			customTransformations: {
				// @ts-expect-error - Extending the set of supported node types within this package causes issues.
				// So rather than extending `PhrasingContentMap` with our custom node, we'll just ignore TypeScript's complaints here.
				custom: customDocumentationNodeToMarkdown,
			},
		});

		expect(result).to.deep.equal([{ type: "text", value: "foo!" }]);
	});

	it("Throws rendering a custom node type when no renderer is provided for it", () => {
		const input = new CustomDocumentationNode("foo");
		expect(() => testTransformation(input)).to.throw();
	});
});
