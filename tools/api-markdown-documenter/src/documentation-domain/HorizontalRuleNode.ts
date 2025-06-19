/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { DocumentationNode } from "./DocumentationNode.js";

/**
 * A horizontal line dividing above and below contents in a document.
 *
 * @example Markdown
 *
 * ```md
 * ---
 * ```
 *
 * @example HTML
 *
 * ```html
 * <hr>
 * ```
 *
 * @see {@link https://www.markdownguide.org/basic-syntax#horizontal-rules}
 *
 * @sealed
 * @public
 */
export class HorizontalRuleNode implements DocumentationNode {
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = "horizontalRule";

	/**
	 * {@inheritDoc DocumentationNode.isLiteral}
	 */
	public readonly isLiteral = true;

	/**
	 * {@inheritDoc DocumentationNode.isParent}
	 */
	public readonly isParent = false;

	/**
	 * Static `HorizontalRuleNode` singleton.
	 */
	public static readonly Singleton = new HorizontalRuleNode();

	/**
	 * {@inheritDoc DocumentationNode.isEmpty}
	 */
	public readonly isEmpty = false;

	public constructor() {}
}
