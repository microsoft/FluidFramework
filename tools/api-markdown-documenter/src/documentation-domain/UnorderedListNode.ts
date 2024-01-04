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
// - Support for nested lists

/**
 * An unordered (bulleted) list.
 *
 * @example Markdown
 *
 * ```md
 * - Foo
 * - Bar
 * - Baz
 * ```
 *
 * @example HTML
 *
 * ```html
 * <ul>
 * 	<li>Foo</li>
 * 	<li>Bar</li>
 * 	<li>Baz</li>
 * </ul>
 * ```
 *
 * @public
 */
export class UnorderedListNode
	extends DocumentationParentNodeBase<SingleLineDocumentationNode>
	implements MultiLineDocumentationNode
{
	/**
	 * Static singleton representing an empty Unordered List node.
	 */
	public static readonly Empty = new UnorderedListNode([]);

	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.UnorderedList;

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
	 * Creates an {@link UnorderedListNode} from a list of single-line string entries.
	 */
	public static createFromPlainTextEntries(entries: string[]): UnorderedListNode {
		return new UnorderedListNode(entries.map((entry) => new PlainTextNode(entry)));
	}
}
