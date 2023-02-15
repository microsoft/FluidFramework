/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNodeType } from "./DocumentationNodeType";
import { ParentNodeBase, SingleLineElementNode } from "./DocumentionNode";
import { PlainTextNode } from "./PlainTextNode";

// TODOs:
// - Do we support a special input for doing nested sub-lists?

export class OrderedListNode extends ParentNodeBase<SingleLineElementNode> {
	/**
	 * Static singleton representing an empty Ordered List node.
	 */
	public static readonly Empty = new OrderedListNode([]);

	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.OrderedList;

	public constructor(children: SingleLineElementNode[]) {
		super(children);
	}

	public static createFromPlainTextEntries(entries: string[]): OrderedListNode {
		return new OrderedListNode(entries.map((entry) => new PlainTextNode(entry)));
	}
}
