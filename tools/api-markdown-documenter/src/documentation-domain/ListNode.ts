/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocumentationParentNodeBase } from "./DocumentationNode.js";
import { ListItemNode } from "./ListItemNode.js";

/**
 * A list of child contents. Can be ordered or unordered.
 *
 * @example Markdown (ordered list)
 *
 * ```md
 * 1. Foo
 * 2. Bar
 * 3. Baz
 * ```
 *
 * @example Markdown (unordered list)
 *
 * ```md
 * - Foo
 * - Bar
 * - Baz
 * ```
 *
 * @example HTML (ordered list)
 *
 * ```html
 * <ol>
 * 	<li>Foo</li>
 * 	<li>Bar</li>
 * 	<li>Baz</li>
 * </ol>
 * ```
 *
 * @example HTML (unordered list)
 *
 * ```html
 * <ul>
 * 	<li>Foo</li>
 * 	<li>Bar</li>
 * 	<li>Baz</li>
 * </ul>
 * ```
 *
 * @sealed
 * @public
 */
export class ListNode extends DocumentationParentNodeBase<ListItemNode> {
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = "list";

	/**
	 * {@inheritDoc DocumentationNode.singleLine}
	 */
	public override get singleLine(): false {
		return false;
	}

	/**
	 * Whether the list is ordered (numbered) or unordered (bulleted).
	 */
	public readonly ordered: boolean;

	public constructor(children: ListItemNode[], ordered: boolean) {
		super(children);
		this.ordered = ordered;
	}

	/**
	 * Creates an {@link ListNode} from a list of single-line string entries.
	 */
	public static createFromPlainTextEntries(entries: string[], ordered: boolean): ListNode {
		return new ListNode(
			entries.map((entry) => ListItemNode.createFromPlainText(entry)),
			ordered,
		);
	}
}
