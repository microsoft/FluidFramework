/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase, SingleLineElementNode } from "./DocumentionNode";
import { PlainTextNode } from "./PlainTextNode";
import { createNodesFromPlainText } from "./Utilities";

/**
 * Text formatting options used by {@link SpanNode}.
 */
export interface TextFormatting {
	/**
	 * @defaultValue Inherit
	 */
	italic?: boolean;

	/**
	 * @defaultValue Inherit
	 */
	bold?: boolean;

	/**
	 * @defaultValue Inherit
	 */
	strikethrough?: boolean;

	// TODO: underline?
	// TODO: what else?
}

export class SpanNode<
	TDocumentationNode extends DocumentationNode = DocumentationNode,
> extends ParentNodeBase<TDocumentationNode> {
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

/**
 * Generates an {@link SingleLineSpanNode} from the provided string.
 * @param text - The node contents. Note: must not contain newline characters.
 * @param formatting - See {@link SpanNode.formatting}
 */
export function createSingleLineSpanFromPlainText(
	text: string,
	formatting?: TextFormatting,
): SingleLineSpanNode {
	return new SpanNode<PlainTextNode>([new PlainTextNode(text)], formatting);
}
