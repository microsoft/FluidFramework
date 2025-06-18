/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { DocumentationNode } from "./DocumentationNode.js";

/**
 * An explicit line break in a document.
 *
 * @remarks
 *
 * Note that {@link PlainTextNode} does not support line breaks.
 *
 * To build up a grouping of text including line breaks, use this type alongside text nodes within a
 * container type like {@link ParagraphNode} or {@link SpanNode}.
 *
 * @sealed
 * @public
 */
export class LineBreakNode implements DocumentationNode {
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = "lineBreak";

	/**
	 * {@inheritDoc DocumentationNode.isLiteral}
	 */
	public readonly isLiteral = true;

	/**
	 * {@inheritDoc DocumentationNode.isParent}
	 */
	public readonly isParent = false;

	/**
	 * Static `LineBreakNode` singleton.
	 */
	public static readonly Singleton = new LineBreakNode();

	/**
	 * {@inheritDoc DocumentationNode.isEmpty}
	 */
	public readonly isEmpty = false;

	public constructor() {}
}
