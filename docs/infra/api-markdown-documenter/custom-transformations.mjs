/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

//@ts-check
/** @typedef {import("@fluid-tools/api-markdown-documenter").BlockContent} BlockContent */
/** @typedef {import("@fluid-tools/api-markdown-documenter").ToMarkdownContext} ToMarkdownContext */
/** @typedef {import("mdast").BlockContent} MdastBlockContent */
/** @typedef {import("mdast").RootContent} MdastRootContent */

import {
	documentationNodeToHtml,
	HtmlRenderer,
	TableNode,
} from "@fluid-tools/api-markdown-documenter";
import { AdmonitionNode } from "./admonition-node.mjs";

/**
 * Generates Markdown for an {@link AdmonitionNode} using Docusaurus syntax.
 *
 * @param {AdmonitionNode} admonitionNode - The node to render.
 * @param {ToMarkdownContext} context - The transformation context.
 *
 * @type {import("@fluid-tools/api-markdown-documenter").ToMarkdownTransformation<AdmonitionNode, MdastBlockContent[]>}
 */
export const transformAdmonitionNode = (admonitionNode, context) => {
	return admonitionNode.toMarkdown(context);
};

/**
 * Type guard for element HAST nodes.
 * @param {import("hast").Nodes} node - The node to check.
 * @returns {node is import("hast").Element} Whether the node is an element.
 */
function isElement(node) {
	return node.type === "element";
}

/**
 * Renders a {@link TableNode} using HTML syntax, and applies the desired CSS class to it.
 *
 * @param {TableNode} tableNode - The node to render.
 * @param {ToMarkdownContext} context - The transformation context.
 *
 * @type {import("@fluid-tools/api-markdown-documenter").ToMarkdownTransformation<TableNode, [MdastBlockContent]>}
 */
export const transformTableNode = (tableNode, context) => {
	// Generate HTML AST for the table node.

	const htmlTree = documentationNodeToHtml(tableNode, {
		startingHeadingLevel: context.headingLevel,
		logger: context.logger,
		customTransformations: undefined,
	});

	if (!isElement(htmlTree)) {
		throw new Error("Expected an HTML element as output from table node transformation.");
	}

	htmlTree.properties.class = "table table-striped table-hover";

	// Convert the HTML AST to a string.
	const htmlString = HtmlRenderer.renderHtml(htmlTree, { prettyFormatting: true });

	return [
		{
			type: "html",
			value: htmlString,
		},
	];
};
