/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import type { Nodes as MdastTree } from "mdast";

import type { DocumentationNode } from "../../documentation-domain/index.js";
import { documentationNodeToMarkdown } from "../ToMarkdown.js";
import { createTransformationContext } from "../TransformationContext.js";
import type { TransformationConfiguration } from "../configuration/index.js";

/**
 * Tests transforming an individual {@link DocumentationNode} to HTML.
 */
export function testTransformation<TNode extends DocumentationNode>(
	node: TNode,
	config?: Partial<TransformationConfiguration>,
): MdastTree[] {
	return documentationNodeToMarkdown(node, createTransformationContext(config));
}

/**
 * Runs the {@link documentationNodeToHtml} transformation on the input and asserts the output matches the expected
 * `hast` tree.
 */
export function assertTransformation<TNode extends DocumentationNode>(
	input: TNode,
	expected: MdastTree[],
	transformationConfig?: TransformationConfiguration,
): void {
	const actual = testTransformation(input, transformationConfig);
	expect(actual).to.deep.equal(expected);
}
