/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNodeType } from "./DocumentationNodeType";
import { ParentNodeBase, SingleLineElementNode } from "./DocumentionNode";

// TODOs:
// - Do we support a special input for doing nested sub-lists?

export class UnorderedListNode extends ParentNodeBase<SingleLineElementNode> {
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.UnorderedList;

	public constructor(children: SingleLineElementNode[]) {
		super(children);
	}
}
