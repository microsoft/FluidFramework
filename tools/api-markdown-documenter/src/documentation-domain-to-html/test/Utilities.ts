/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import type { Nodes as HastNodes } from "hast";
import { fromHtml } from "hast-util-from-html";
import { toHtml } from "hast-util-to-html";
import type { DocumentationNode } from "../../documentation-domain/index.js";
import { createTransformationContext } from "../TransformationContext.js";
import { type TransformationConfig } from "../configuration/index.js";
import { documentationNodeToHtml } from "../ToHtml.js";

/**
 * Tests transforming an individual {@link DocumentationNode} to HTML.
 */
export function testTransformation(
	node: DocumentationNode,
	config?: Partial<TransformationConfig>,
): HastNodes {
	return documentationNodeToHtml(node, createTransformationContext(config));
}

/**
 * Since HTML content could contain formatting, which we don't want to validate, this function can be used to strip
 * formatting from a raw HTML string by parsing it into a HAST tree and then converting it back to HTML.
 * @deprecated Don't use.
 */
export function sanitizeExpected(rawHtml: string): string {
	const tree = fromHtml(rawHtml, { fragment: true });
	return toHtml(tree.children);
}

/**
 * Don't use.
 * @deprecated This does weird things in some cased. Remove before checking in. Use {@link assertTransformation} instead.
 */
export function assertExpectedHtml(
	input: DocumentationNode,
	expectedHtml: string,
	transformationConfig?: TransformationConfig,
): void {
	const actual = testTransformation(input, transformationConfig);
	const sanitizedExpected = sanitizeExpected(expectedHtml);
	expect(toHtml(actual)).to.equal(sanitizedExpected);
}

/**
 * Runs the {@link documentationNodeToHtml} transformation on the input and asserts the output matches the expected
 * `hast` tree.
 */
export function assertTransformation(
	input: DocumentationNode,
	expected: HastNodes,
	transformationConfig?: TransformationConfig,
): void {
	const actual = testTransformation(input, transformationConfig);
	expect(actual).to.deep.equal(expected);
}
