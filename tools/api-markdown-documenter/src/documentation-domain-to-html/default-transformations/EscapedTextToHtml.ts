/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Required for use of "raw" element.
// eslint-disable-next-line import/no-unassigned-import
import "hast-util-raw";

import type { Nodes as HastTree } from "hast";

import type { EscapedTextNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";

import { applyFormatting } from "./Utilities.js";

/**
 * Transform a {@link PlainTextNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function escapedTextToHtml(
	node: EscapedTextNode,
	context: TransformationContext,
): HastTree {
	// Any "escaped" text coming from the DocumentationDomain is intended to be passed through as raw text in the output.
	// This allows things like embedded HTML and Markdown in TSDoc comments to be preserved in the output.
	// We are leveraging the `hast-util-raw` plugin to handle this for us.
	// If we encounter "escaped" text, we will emit it as a "raw" node.
	const transformed: HastTree = {
		type: "raw",
		value: node.text,
	};

	return applyFormatting(transformed, context);
}
