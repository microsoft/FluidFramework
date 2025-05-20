/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { LinkNode } from "../../../documentation-domain/index.js";
import type { DocumentWriter } from "../../DocumentWriter.js";
import { renderNode } from "../Render.js";
import type { RenderContext } from "../RenderContext.js";

/**
 * Renders a {@link LinkNode} as Markdown.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 */
export function renderLink(
	node: LinkNode,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	writer.write("[");
	renderNode(node.text, writer, context);
	writer.write(`](${node.target})`);
}
