/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { PhrasingContent } from "mdast";

import { DocumentationParentNodeBase } from "./DocumentationNode.js";

/**
 * A grouping of text content, potentially spanning multiple lines.
 *
 * @example Markdown
 *
 * ```md
 * Some content...
 *
 * Some more content...
 *
 * ```
 *
 * Note that a paragraph in Markdown will always include a trailing newline.
 *
 * @example HTML
 *
 * ```html
 * <p>
 * 	Some content...
 *
 * 	Some more content...
 * </p>
 * ```
 *
 * @sealed
 * @public
 */
export class ParagraphNode extends DocumentationParentNodeBase<PhrasingContent> {
	/**
	 * Static singleton representing an empty Paragraph node.
	 */
	public static readonly Empty = new ParagraphNode([]);

	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = "paragraph";

	public constructor(children: PhrasingContent[]) {
		super(children);
	}

	/**
	 * Generates an `ParagraphNode` from the provided string.
	 * @param text - The node contents.
	 */
	public static createFromPlainText(text: string): ParagraphNode {
		return new ParagraphNode([
			{
				type: "text",
				value: text,
			},
		]);
	}
}
