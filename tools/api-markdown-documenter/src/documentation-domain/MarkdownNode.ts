/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BlockContent as MdastBlockContent } from "mdast";

import { DocumentationLiteralNodeBase } from "./DocumentationNode.js";

/**
 * A {@link DocumentationNode} that wraps an `mdast` "Block content" tree.
 *
 * @remarks
 *
 * This type exists as a temporary solution while this library is migrated to using `mdast` directly (replacing the entire `DocumentationNode` domain).
 * It will eventually be removed, along with the rest of this domain.
 *
 * @sealed
 * @public
 */
export class MarkdownBlockContentNode extends DocumentationLiteralNodeBase<MdastBlockContent> {
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = "markdownBlockContent";

	public constructor(value: MdastBlockContent) {
		super(value);
	}
}
