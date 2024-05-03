/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Required in order to register the `raw` type with the `hast` ecosystem.
// eslint-disable-next-line import/no-unassigned-import
import "hast-util-raw";

import type { Nodes as HastNodes } from "hast";
import type { PlainTextNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * This logic was adapted from:
 * {@link https://github.com/microsoft/rushstack/blob/main/apps/api-documenter/src/markdown/MarkdownEmitter.ts}
 */

/**
 * Transform a {@link PlainTextNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function plainTextToHtml(node: PlainTextNode, context: TransformationContext): HastNodes {
	// Any "escaped" text coming from the DocumentationDomain is intended to be passed through as raw text in the output.
	// This allows things like embedded HTML and Markdown in TSDoc comments to be preserved in the output.
	// We are leveraging the `hast-util-raw` plugin to handle this for us.
	// If we encounter "escaped" text, we will emit it as a "raw" node.
	// Otherwise, emit as standard text.
	return {
		type: node.escaped ? "raw" : "text",
		value: node.text,
	};
}
