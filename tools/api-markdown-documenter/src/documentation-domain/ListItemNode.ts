/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocumentationParentNodeBase } from "./DocumentationNode.js";
import type { PhrasingContent } from "./PhrasingContent.js";
import { PlainTextNode } from "./PlainTextNode.js";

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

	/**
	 * {@inheritDoc DocumentationNode.singleLine}
	 */
	public override get singleLine(): false {
		return false;
	}

	public constructor(children: PhrasingContent[]) {
		super(children);
	}

	/**
	 * Creates an {@link ListItemNode} from a list of single-line string entries.
	 */
	public static createFromPlainText(text: string): ListItemNode {
		return new ListItemNode([new PlainTextNode(text)]);
	}
}
