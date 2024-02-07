/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	type DocumentationNode,
	DocumentationParentNodeBase,
	type MultiLineDocumentationNode,
} from "./DocumentationNode";
import { DocumentationNodeType } from "./DocumentationNodeType";
import { createNodesFromPlainText } from "./Utilities";

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
 *
 * @public
 */
export class FencedCodeBlockNode
	extends DocumentationParentNodeBase
	implements MultiLineDocumentationNode
{
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.FencedCode;

	/**
	 * (optional) Code language to associated with the code block.
	 */
	public readonly language?: string;

	/**
	 * {@inheritDoc DocumentationNode.singleLine}
	 */
	public override get singleLine(): false {
		return false;
	}

	public constructor(children: DocumentationNode[], language?: string) {
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
