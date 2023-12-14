/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { type MultiLineDocumentationNode } from "./DocumentationNode";
import { DocumentationNodeType } from "./DocumentationNodeType";

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
 * @public
 */
export class LineBreakNode implements MultiLineDocumentationNode {
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.LineBreak;

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
	 * {@inheritDoc DocumentationNode.singleLine}
	 */
	public readonly singleLine = false;

	public constructor() {}
}
