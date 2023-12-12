/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { ParagraphNode } from "../../../documentation-domain";
import type { DocumentWriter } from "../../DocumentWriter";
import type { RenderContext } from "../RenderContext";
import { renderContentsUnderTag } from "../Utilities";

/**
 * Renders a {@link ParagraphNode} as HTML.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 */
export function renderParagraph(
	node: ParagraphNode,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	renderContentsUnderTag(node.children, "p", writer, context);
}
