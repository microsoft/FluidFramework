/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { DocumentationNode, LiteralNode } from "../../documentation-domain";
import { DocumentationNodeRenderer } from "../md-transformers";

/**
 * Mock custom {@link DocumentationNode} for use in the tests below.
 */
class CustomDocumentationNode implements LiteralNode<string> {
	public readonly type = "Custom Node";
	public readonly value: string;
	public constructor(value: string) {
		this.value = value;
	}

	// TODO: remove this
	public equals(other: DocumentationNode): boolean {
		return false;
	}
}

/**
 * Mock custom renderer for {@link CustomDocumentationNode}.
 */
function renderCustomDocumentationNode(node: CustomDocumentationNode): string {
	return node.value;
}

describe("CodeSpan markdown tests", () => {
	it("Can render a custom node type when given a renderer", () => {
		const renderer = new DocumentationNodeRenderer({
			["Custom Node"]: (node): string =>
				renderCustomDocumentationNode(node as CustomDocumentationNode),
		});

		const customNode = new CustomDocumentationNode("foo");

		const result = renderer.renderNode(customNode);
		expect(result).to.equal("foo");
	});

	it("Throws rendering a custom node type when no renderer is provided for it", () => {
		const renderer = new DocumentationNodeRenderer();
		const customNode = new CustomDocumentationNode("foo");
		expect(() => renderer.renderNode(customNode)).to.throw();
	});
});
