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
 */
export function sanitizeExpected(rawHtml: string): string {
	const tree = fromHtml(rawHtml, { fragment: true });
	return toHtml(tree.children);
}

/**
 * TODO
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
