/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocumentationParentNodeBase, type DocumentationNode } from "./DocumentationNode.js";
import { DocumentationNodeType } from "./DocumentationNodeType.js";
import { PlainTextNode } from "./PlainTextNode.js";

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
export class OrderedListNode extends DocumentationParentNodeBase {
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

	public constructor(children: DocumentationNode[]) {
		super(children);
	}

	/**
	 * Creates an {@link OrderedListNode} from a list of single-line string entries.
	 */
	public static createFromPlainTextEntries(entries: string[]): OrderedListNode {
		return new OrderedListNode(entries.map((entry) => new PlainTextNode(entry)));
	}
}
