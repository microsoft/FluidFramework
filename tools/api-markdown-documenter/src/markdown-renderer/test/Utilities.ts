/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { StringBuilder } from "@microsoft/tsdoc";

import { DocumentationNode } from "../../documentation-domain";
import { DocumentWriter } from "../DocumentWriter";
import { defaultNodeRenderers, getRootRenderContext, renderNode } from "../Render";
import { DocumentationNodeRenderers, MarkdownRenderContext } from "../RenderContext";

/**
 * Tests the rendering of an individual {@link DocumentationNode}, returning the generated string content.
 */
export function testRender(
	node: DocumentationNode,
	customRenderers?: DocumentationNodeRenderers,
	customContext?: Partial<MarkdownRenderContext>,
): string {
	const renderers: DocumentationNodeRenderers = {
		...defaultNodeRenderers,
		...customRenderers,
	};

	const context = { ...getRootRenderContext(renderers), ...customContext };

	const writer = new DocumentWriter(new StringBuilder());

	renderNode(node, writer, context);

	return writer.getText();
}
