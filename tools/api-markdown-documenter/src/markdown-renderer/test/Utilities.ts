/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { StringBuilder } from "@microsoft/tsdoc";

import type { DocumentationNode } from "../../documentation-domain";
import { DocumentWriter } from "../DocumentWriter";
import { renderNode } from "../Render";
import { MarkdownRenderContext, getContextWithDefaults } from "../RenderContext";

/**
 * Tests the rendering of an individual {@link DocumentationNode}, returning the generated string content.
 */
export function testRender(
	node: DocumentationNode,
	partialContext?: Partial<MarkdownRenderContext>,
): string {
	const context = getContextWithDefaults(partialContext);
	const writer = new DocumentWriter(new StringBuilder());

	renderNode(node, writer, context);

	return writer.getText();
}
