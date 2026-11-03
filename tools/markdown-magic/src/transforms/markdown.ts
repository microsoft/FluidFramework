/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

import type { RootContent } from "mdast";

import type { TransformContext } from "../types.js";

/**
 * Parses generated Markdown into nodes for structural composition.
 *
 * @param markdown - The generated Markdown text to parse.
 * @param context - The services and destination details for the transform.
 * @param name - The fragment name used in parser diagnostics.
 * @returns The parsed root-content nodes.
 */
export function parseFragment(
	markdown: string,
	context: TransformContext,
	name: string,
): RootContent[] {
	const virtualPath = path.join(
		path.dirname(context.destinationPath),
		`.markdown-magic-${name}.md`,
	);
	return context.parseDocument(markdown, virtualPath).tree.children;
}
