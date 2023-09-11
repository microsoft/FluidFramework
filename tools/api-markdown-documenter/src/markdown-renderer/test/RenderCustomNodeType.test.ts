/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { DocumentationLiteralNodeBase } from "../../documentation-domain";
import { DocumentWriter } from "../DocumentWriter";
import { MarkdownRenderContext } from "../RenderContext";
import { testRender } from "./Utilities";

/**
 * Mock custom {@link DocumentationNode} for use in the tests below.
 */
class CustomDocumentationNode extends DocumentationLiteralNodeBase<string> {
	public static readonly type = "Custom Node";
	public readonly type = CustomDocumentationNode.type;
	public readonly singleLine: boolean = false;
	public constructor(value: string) {
		super(value);
	}
}

/**
 * Mock custom renderer for {@link CustomDocumentationNode}.
 */
function renderCustomDocumentationNode(
	node: CustomDocumentationNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	writer.write(node.value);
}

// The following are testing our support for custom DocumentationNode implementations.
// Assuming an appropriate renderer is supplied, the system should be able to handle them correctly.
describe("Custom node rendering tests", () => {
	it("Can render a custom node type when given a renderer", () => {
		const input = new CustomDocumentationNode("foo");
		const result = testRender(input, {
			renderers: {
				[CustomDocumentationNode.type]: (node, writer, context): void =>
					renderCustomDocumentationNode(node as CustomDocumentationNode, writer, context),
			},
		});

		expect(result).to.equal("foo");
	});

	it("Throws rendering a custom node type when no renderer is provided for it", () => {
		const input = new CustomDocumentationNode("foo");
		expect(() => testRender(input)).to.throw();
	});
});
