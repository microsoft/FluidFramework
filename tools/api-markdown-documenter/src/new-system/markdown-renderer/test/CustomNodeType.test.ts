/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { LiteralNode } from "../../documentation-domain";
import { DocumentWriter } from "../DocumentWriter";
import { MarkdownRenderContext } from "../RenderContext";
import { testRender } from "./Utilities";

/**
 * Mock custom {@link DocumentationNode} for use in the tests below.
 */
class CustomDocumentationNode implements LiteralNode<string> {
	public static readonly type = "Custom Node";
	public readonly type = CustomDocumentationNode.type;
	public readonly value: string;
	public constructor(value: string) {
		this.value = value;
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

describe("Custom node rendering tests", () => {
	it("Can render a custom node type when given a renderer", () => {
		const input = new CustomDocumentationNode("foo");
		const result = testRender(input, {
			[CustomDocumentationNode.type]: (node, writer, context): void =>
				renderCustomDocumentationNode(node as CustomDocumentationNode, writer, context),
		});

		expect(result).to.equal("foo");
	});

	it("Throws rendering a custom node type when no renderer is provided for it", () => {
		const input = new CustomDocumentationNode("foo");
		expect(() => testRender(input)).to.throw();
	});
});
