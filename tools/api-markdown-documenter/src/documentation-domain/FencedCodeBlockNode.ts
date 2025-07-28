/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocumentationLiteralNodeBase } from "./DocumentationNode.js";
import type { LineBreakNode } from "./LineBreakNode.js";
import type { PlainTextNode } from "./PlainTextNode.js";

/**
 * The types of child nodes that can be contained within a {@link FencedCodeBlockNode}.
 *
 * @public
 */
export type FencedCodeBlockNodeContent = PlainTextNode | LineBreakNode;

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
export class FencedCodeBlockNode extends DocumentationLiteralNodeBase<string> {
	/**
	 * Static singleton representing an empty Fenced Code Block node.
	 */
	public static readonly Empty: FencedCodeBlockNode = new FencedCodeBlockNode("");

	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = "fencedCode";

	/**
	 * (optional) Code language to associated with the code block.
	 */
	public readonly language?: string;

	/**
	 * {@inheritDoc DocumentationNode.isEmpty}
	 */
	public override get isEmpty(): boolean {
		return this.value.length === 0;
	}

	public constructor(value: string, language?: string) {
		super(value);
		this.language = language;
	}

	/**
	 * Generates an `FencedCodeBlockNode` from the provided string.
	 * @param text - The node contents.
	 * @param language - (optional) code language to associated with the code block.
	 */
	public static createFromPlainText(text: string, language?: string): FencedCodeBlockNode {
		return new FencedCodeBlockNode(text, language);
	}
}
