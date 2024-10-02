/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Nodes as HastTree } from "hast";
import { h } from "hastscript";

import type { TextFormatting } from "../../documentation-domain/index.js";

/**
 * Wraps the provided tree in the appropriate formatting tags based on the provided context.
 */
export function applyFormatting(tree: HastTree, context: TextFormatting): HastTree {
	let result: HastTree = tree;

	// The ordering in which we wrap here is effectively arbitrary, but it does impact the order of the tags in the output.
	// Note if you're editing: tests may implicitly rely on this ordering.
	if (context.strikethrough === true) {
		result = h("s", undefined, result);
	}
	if (context.italic === true) {
		result = h("i", undefined, result);
	}
	if (context.bold === true) {
		result = h("b", undefined, result);
	}

	return result;
}
