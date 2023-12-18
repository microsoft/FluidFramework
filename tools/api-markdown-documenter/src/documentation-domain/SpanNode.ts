/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	type DocumentationNode,
	DocumentationParentNodeBase,
	type SingleLineDocumentationNode,
} from "./DocumentationNode";
import { DocumentationNodeType } from "./DocumentationNodeType";
import { PlainTextNode } from "./PlainTextNode";
import { type TextFormatting } from "./TextFormatting";
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
 *
 * @public
 */
export class SpanNode<
	TDocumentationNode extends DocumentationNode = DocumentationNode,
> extends DocumentationParentNodeBase<TDocumentationNode> {
	/**
	 * Static singleton representing an empty Span Text node.
	 */
	public static readonly Empty: SpanNode = new SpanNode([]);

	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.Span;

	/**
	 * Formatting to apply to all {@link DocumentationParentNode.children}.
	 *
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
 * A {@link SpanNode} that contractually fits on a single line.
 *
 * @public
 */
export class SingleLineSpanNode
	extends SpanNode<SingleLineDocumentationNode>
	implements SingleLineDocumentationNode
{
	/**
	 * {@inheritDoc DocumentationNode.singleLine}
	 */
	public override get singleLine(): true {
		return true;
	}

	public constructor(children: SingleLineDocumentationNode[], formatting?: TextFormatting) {
		super(children, formatting);
	}

	/**
	 * Generates an `SingleLineSpanNode` from the provided string.
	 * @param text - The node contents.
	 */
	public static createFromPlainText(
		text: string,
		formatting?: TextFormatting,
	): SingleLineSpanNode {
		return new SingleLineSpanNode([new PlainTextNode(text)], formatting);
	}
}
