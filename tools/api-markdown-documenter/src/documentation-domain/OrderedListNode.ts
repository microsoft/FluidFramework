/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	DocumentationParentNodeBase,
	type MultiLineDocumentationNode,
	type SingleLineDocumentationNode,
} from "./DocumentationNode";
import { DocumentationNodeType } from "./DocumentationNodeType";
import { PlainTextNode } from "./PlainTextNode";

// TODOs:
// - Add support for nested lists

/**
 * An ordered (numbered) list of child contents.
 *
 * @example Markdown
 *
 * ```md
 * 1. Foo
 * 2. Bar
 * 3. Baz
 * ```
 *
 * @example HTML
 *
 * ```html
 * <ol>
 * 	<li>Foo</li>
 * 	<li>Bar</li>
 * 	<li>Baz</li>
 * </ol>
 * ```
 *
 * @public
 */
export class OrderedListNode
	extends DocumentationParentNodeBase<SingleLineDocumentationNode>
	implements MultiLineDocumentationNode
{
	/**
	 * Static singleton representing an empty Ordered List node.
	 */
	public static readonly Empty = new OrderedListNode([]);

	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.OrderedList;

	/**
	 * {@inheritDoc DocumentationNode.singleLine}
	 */
	public override get singleLine(): false {
		return false;
	}

	public constructor(children: SingleLineDocumentationNode[]) {
		super(children);
	}

	/**
	 * Creates an {@link OrderedListNode} from a list of single-line string entries.
	 */
	public static createFromPlainTextEntries(entries: string[]): OrderedListNode {
		return new OrderedListNode(entries.map((entry) => new PlainTextNode(entry)));
	}
}
