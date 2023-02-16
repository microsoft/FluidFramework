/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNodeType } from "./DocumentationNodeType";
import { ParentNodeBase, SingleLineElementNode } from "./DocumentionNode";
import { LineBreakNode } from "./LineBreakNode";
import { createNodesFromPlainText } from "./Utilities";

/**
 * Types allowed as children under {@link FencedCodeBlockNode}.
 */
export type FencedCodeBlockChildren = LineBreakNode | SingleLineElementNode;

/**
 * A fenced code block, with an optional associated code language.
 *
 * @example Markdown
 *
 * ```md
 * \`\`\`typescrpt
 * const foo = "bar";
 * \`\`\`
 * ```
 *
 * @example HTML
 *
 * ```html
 * <code>
 * 	const foo = "bar";
 * </code>
 * ```
 */
export class FencedCodeBlockNode extends ParentNodeBase<FencedCodeBlockChildren> {
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.FencedCode;

	/**
	 * (optional) Code language to associated with the code block.
	 */
	public readonly language?: string;

	public constructor(children: FencedCodeBlockChildren[], language?: string) {
		super(children);
		this.language = language;
	}

	/**
	 * Generates an `FencedCodeBlockNode` from the provided string.
	 * @param text - The node contents.
	 * @param language - (optional) code language to associated with the code block.
	 */
	public static createFromPlainText(text: string, language?: string): FencedCodeBlockNode {
		return new FencedCodeBlockNode(createNodesFromPlainText(text), language);
	}
}
