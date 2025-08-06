/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import type { Nodes as HastNodes } from "hast";

import type { Section, SectionHeading } from "../../mdast/index.js";
import { documentationNodeToHtml } from "../ToHtml.js";
import { createTransformationContext } from "../TransformationContext.js";
import type { TransformationConfiguration } from "../configuration/index.js";

/**
 * Tests transforming an individual documentation node to HTML.
 */
function testTransformation(
	node: Section | SectionHeading,
	config?: Partial<TransformationConfiguration>,
): HastNodes {
	return documentationNodeToHtml(node, createTransformationContext(config));
}

/**
 * Runs the {@link documentationNodeToHtml} transformation on the input and asserts the output matches the expected
 * `hast` tree.
 */
export function assertTransformation(
	input: Section | SectionHeading,
	expected: HastNodes,
	transformationConfig?: TransformationConfiguration,
): void {
	const actual = testTransformation(input, transformationConfig);
	expect(actual).to.deep.equal(expected);
}
