/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNodeType } from "./DocumentationNodeType";
import { DocumentationNode } from "./DocumentionNode";

/**
 * Represents a horizontal rule.
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
 */
export class HorizontalRuleNode implements DocumentationNode {
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.HorizontalRule;

	/**
	 * Static `HorizontalRuleNode` singleton.
	 */
	public static readonly Singleton = new HorizontalRuleNode();

	private constructor() {}
}
