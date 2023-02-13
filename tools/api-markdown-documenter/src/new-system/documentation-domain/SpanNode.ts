/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase, SingleLineElementNode } from "./DocumentionNode";
import { PlainTextNode } from "./PlainTextNode";
import { compareNodeArrays, createNodesFromPlainText } from "./Utilities";

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

function compareTextFormatting(a: TextFormatting, b: TextFormatting): boolean {
	return a.bold === b.bold && a.italic === b.italic && a.strikethrough === b.strikethrough;
}

export class SpanNode<
	TDocumentNode extends DocumentationNode = DocumentationNode,
> extends ParentNodeBase<TDocumentNode> {
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.Span;

	/**
	 * @defaultValue Inherit
	 */
	public readonly textFormatting?: TextFormatting;

	public constructor(children: TDocumentNode[], formatting?: TextFormatting) {
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

	/**
	 * {@inheritDoc DocumentationNode.equals}
	 */
	public equals(other: DocumentationNode): boolean {
		if (this.type !== other.type) {
			return false;
		}

		const otherSpan = other as SpanNode;

		if (this.textFormatting === undefined) {
			if (otherSpan.textFormatting !== undefined) {
				return false;
			}
		} else {
			if (otherSpan.textFormatting === undefined) {
				return false;
			}
			if (!compareTextFormatting(this.textFormatting, otherSpan.textFormatting)) {
				return false;
			}
		}

		return compareNodeArrays(this.children, otherSpan.children);
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
