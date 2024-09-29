/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromHtml } from "hast-util-from-html";
import { removePosition } from "unist-util-remove-position";

import type { Nodes as HastNodes } from "hast";
import type { PlainTextNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { applyFormatting } from "./Utilities.js";

/**
 * Transform a {@link PlainTextNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function plainTextToHtml(node: PlainTextNode, context: TransformationContext): HastNodes {
	let transformed: HastNodes;
	if (node.escaped) {
		transformed = fromHtml(node.text, { fragment: true, verbose: false });

		// `fromHtml` currently includes position data in its output, despite the `verbose: false` option, which is supposed to disable this.
		// See <https://github.com/syntax-tree/hast-util-from-html/issues/7>
		// To ensure output is simple and testable, strip the positioning data out.
		removePosition(transformed, {
			// Remove properties entirely, rather than setting them to `undefined`.
			force: true,
		});

		// `fromHtml` also adds a `data` property to the root node, which we don't need.
		delete transformed.data;
	} else {
		transformed = {
			type: "text",
			value: node.text,
		};
	}

	return applyFormatting(transformed, context);
}
