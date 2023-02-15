/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNodeType } from "./DocumentationNodeType";
import { ParentNodeBase, SingleLineElementNode } from "./DocumentionNode";
import { PlainTextNode } from "./PlainTextNode";

// TODOs:
// - Do we support a special input for doing nested sub-lists?

export class UnorderedListNode extends ParentNodeBase<SingleLineElementNode> {
	/**
	 * Static singleton representing an empty Unordered List node.
	 */
	public static readonly Empty = new UnorderedListNode([]);

	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.UnorderedList;

	public constructor(children: SingleLineElementNode[]) {
		super(children);
	}

	public static createFromPlainTextEntries(entries: string[]): UnorderedListNode {
		return new UnorderedListNode(entries.map((entry) => new PlainTextNode(entry)));
	}
}
