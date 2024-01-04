/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { type MultiLineDocumentationNode } from "./DocumentationNode";
import { DocumentationNodeType } from "./DocumentationNodeType";

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
 * @public
 */
export class HorizontalRuleNode implements MultiLineDocumentationNode {
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.HorizontalRule;

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
	 * {@inheritDoc DocumentationNode.singleLine}
	 */
	public readonly singleLine = false;

	public constructor() {}
}
