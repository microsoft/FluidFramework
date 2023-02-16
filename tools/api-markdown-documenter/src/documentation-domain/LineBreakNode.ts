/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNodeType } from "./DocumentationNodeType";
import { DocumentationNode } from "./DocumentionNode";

/**
 * An explicit line break in a document.
 *
 * @remarks
 *
 * Note that {@link PlainTextNode} does not support line breaks.
 *
 * To build up a grouping of text including line breaks, use this type alongside text nodes within a
 * container type like {@link ParagraphNode} or {@link SpanNode}.
 */
export class LineBreakNode implements DocumentationNode {
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.LineBreak;

	/**
	 * Static `LineBreakNode` singleton.
	 */
	public static readonly Singleton = new LineBreakNode();

	public constructor() {}
}
