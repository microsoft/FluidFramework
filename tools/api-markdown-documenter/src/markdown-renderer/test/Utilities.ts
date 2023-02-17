/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { StringBuilder } from "@microsoft/tsdoc";

import type { DocumentationNode } from "../../documentation-domain";
import { DocumentWriter } from "../DocumentWriter";
import { createRenderContext, renderNode } from "../Render";
import { type MarkdownRenderers, defaultMarkdownRenderers } from "../RenderConfiguration";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * Tests the rendering of an individual {@link DocumentationNode}, returning the generated string content.
 */
export function testRender(
	node: DocumentationNode,
	customRenderers?: MarkdownRenderers,
	customContext?: Partial<MarkdownRenderContext>,
): string {
	const renderers: MarkdownRenderers = {
		...defaultMarkdownRenderers,
		...customRenderers,
	};

	const context = { ...createRenderContext(renderers), ...customContext };

	const writer = new DocumentWriter(new StringBuilder());

	renderNode(node, writer, context);

	return writer.getText();
}
