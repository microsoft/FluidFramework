/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Html as MdastHtml, PhrasingContent as MdastPhrasingContent } from "mdast";

import { renderHtml } from "../../HtmlRendererModule.js";
import type { DocumentationNode, TextFormatting } from "../../documentation-domain/index.js";
import {
	documentationNodeToHtml,
	type TransformationConfiguration as HtmlTransformationConfiguration,
} from "../../documentation-domain-to-html/index.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Transforms the provided {@link DocumentationNode}s using HTML syntax.
 */
export function transformAsHtml(
	nodes: DocumentationNode,
	context: TransformationContext,
): MdastHtml {
	const htmlTransformationConfig: HtmlTransformationConfiguration = {
		startingHeadingLevel: context.headingLevel,
		logger: context.logger,
	};
	const htmlTree = documentationNodeToHtml(nodes, htmlTransformationConfig);
	const htmlString = renderHtml(htmlTree, {});

	return {
		type: "html",
		value: htmlString,
	};
}

/**
 * Wraps the provided tree in the appropriate formatting tags based on the provided context.
 */
export function applyFormatting(
	tree: MdastPhrasingContent[],
	formatting: TextFormatting,
): MdastPhrasingContent[] {
	let result: MdastPhrasingContent[] = tree;

	// The ordering in which we wrap here is effectively arbitrary, but it does impact the order of the tags in the output.
	// Note if you're editing this code: tests may implicitly rely on this ordering.
	if (formatting.strikethrough === true) {
		result = [{
			type: "delete",
			children: result,
		}];
	}
	if (formatting.italic === true) {
		result = [{
			type: "emphasis",
			children: result,
		}];
	}
	if (formatting.bold === true) {
		result = [{
			type: "strong",
			children: result,
		}];
	}

	return result;
}
