/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase, SingleLineElementNode } from "./DocumentionNode";
import { TextFormatting } from "./TextFormatting";
import { createNodesFromPlainText } from "./Utilities";

/**
 * A grouping of text, potentially spanning multiple lines, which may have some {@link TextFormatting}.
 *
 * @example Markdown
 *
 * ```md
 * _**Some content with formatting...**_
 *
 * **_Some more text with the same formatting...**_
 * ```
 *
 * @example HTML
 *
 * ```html
 * <span>
 * 	<i>
 * 		<b>
 * 			Some content...
 *			<br>
 * 			Some more content...
 * 		</b>
 * 	</i>
 * </span>
 * ```
 */
export class SpanNode<
	TDocumentationNode extends DocumentationNode = DocumentationNode,
> extends ParentNodeBase<TDocumentationNode> {
	/**
	 * Static singleton representing an empty Span Text node.
	 */
	public static readonly Empty: SpanNode = new SpanNode([]);

	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.Span;

	/**
	 * @defaultValue Inherit
	 */
	public readonly textFormatting?: TextFormatting;

	public constructor(children: TDocumentationNode[], formatting?: TextFormatting) {
		super(children);
		this.textFormatting = formatting;
	}

	/**
	 * Generates an `SpanNode` from the provided string.
	 * @param text - The node contents.
	 */
	public static createFromPlainText(text: string, formatting?: TextFormatting): SpanNode {
		return new SpanNode(createNodesFromPlainText(text), formatting);
	}
}

/**
 * Helper type representing {@link SpanNode}s which strictly contain single-line contents.
 */
export type SingleLineSpanNode<
	TDocumentationNode extends SingleLineElementNode = SingleLineElementNode,
> = SpanNode<TDocumentationNode>;
