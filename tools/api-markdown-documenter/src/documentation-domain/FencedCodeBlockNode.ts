/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocumentationParentNodeBase } from "./DocumentationNode.js";
import { DocumentationNodeType } from "./DocumentationNodeType.js";
import type { PhrasingContent } from "./PhrasingContent.js";
import { createNodesFromPlainText } from "./Utilities.js";

/**
 * A fenced code block, with an optional associated code language.
 *
 * @example Markdown
 *
 * ```md
 * \`\`\`typescript
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
 * @sealed
 * @public
 */
export class FencedCodeBlockNode extends DocumentationParentNodeBase<PhrasingContent> {
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

	public constructor(children: PhrasingContent[], language?: string) {
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
