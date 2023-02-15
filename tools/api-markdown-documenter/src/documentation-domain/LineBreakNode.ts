/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNodeType } from "./DocumentationNodeType";
import { DocumentationNode } from "./DocumentionNode";

/**
 * Represents a line break in a document.
 */
export class LineBreakNode implements DocumentationNode {
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.LineBreak;

	// TODO: do we want this? What should it be called?
	public static readonly Singleton = new LineBreakNode();

	public constructor() {}
}
