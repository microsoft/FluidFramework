/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { PhrasingContent } from "mdast";

import { DocumentationParentNodeBase } from "./DocumentationNode.js";

/**
 * An item within a {@link ListNode}.
 *
 * @sealed
 * @public
 */
export class ListItemNode extends DocumentationParentNodeBase<PhrasingContent> {
	/**
	 * Static singleton representing an empty Ordered List node.
	 */
	public static readonly Empty = new ListItemNode([]);

	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = "listItem";

	public constructor(children: PhrasingContent[]) {
		super(children);
	}

	/**
	 * Creates an {@link ListItemNode} from a list of single-line string entries.
	 */
	public static createFromPlainText(text: string): ListItemNode {
		return new ListItemNode([
			{
				type: "text",
				value: text,
			},
		]);
	}
}
