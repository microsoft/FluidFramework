/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { FencedCodeBlockNode } from "../../../documentation-domain";
import type { DocumentWriter } from "../../DocumentWriter";
import type { RenderContext } from "../RenderContext";
import { renderContentsUnderTag } from "../Utilities";

/**
 * Renders a {@link FencedCodeBlockNode} as HTML.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 */
export function renderFencedCodeBlock(
	node: FencedCodeBlockNode,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	renderContentsUnderTag(node.children, "code", writer, context);
}
