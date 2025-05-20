/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ApiItem } from "@microsoft/api-extractor-model";
import {
	type DocCodeSpan,
	type DocDeclarationReference,
	type DocEscapedText,
	type DocFencedCode,
	type DocLinkTag,
	type DocNode,
	DocNodeKind,
	type DocParagraph,
	type DocPlainText,
	type DocSection,
	type DocInlineTag,
	type DocHtmlEndTag,
	type DocHtmlStartTag,
} from "@microsoft/tsdoc";

import type { Link } from "../Link.js";
import type { LoggingConfiguration } from "../LoggingConfiguration.js";
import {
	type BlockContent,
	CodeSpanNode,
	DocumentationNodeType,
	FencedCodeBlockNode,
	LineBreakNode,
	LinkNode,
	ParagraphNode,
	type PhrasingContent,
	PlainTextNode,
	SingleLineSpanNode,
	SpanNode,
} from "../documentation-domain/index.js";

/**
 * Library of transformations from {@link https://github.com/microsoft/tsdoc/blob/main/tsdoc/src/nodes/DocNode.ts| DocNode}s
 * to {@link DocumentationNode}s.
 */

/**
 * Options for {@link @microsoft/tsdoc#DocNode} transformations.
 *
 * @public
 */
export interface TsdocNodeTransformOptions extends LoggingConfiguration {
	/**
	 * The API item with which the documentation node(s) are associated.
	 */
	readonly contextApiItem: ApiItem;

	/**
	 * Callback for resolving symbolic links to API items.
	 *
	 * @param codeDestination - The referenced target.
	 *
	 * @returns The appropriate URL target if the reference can be resolved.
	 * Otherwise, `undefined`.
	 */
	readonly resolveApiReference: (codeDestination: DocDeclarationReference) => Link | undefined;
}

/**
 * Converts a {@link @microsoft/tsdoc#DocSection} to a {@link SectionNode}.
 *
 * @public
 */
export function transformTsdocSection(
	node: DocSection,
	options: TsdocNodeTransformOptions,
): BlockContent[] {
	// TODO: HTML contents come in as a start tag, followed by the content, followed by an end tag, rather than something with hierarchy.
	// To ensure we map the content correctly, we should scan the child list for matching open/close tags,
	// and map the subsequence to an "html" node.

	let transformedChildren: BlockContent[] = [];
	for (const child of node.nodes) {
		transformedChildren.push(...transformTsdocSectionContent(child, options));
	}

	// Remove line breaks adjacent to paragraphs, as they are redundant
	transformedChildren = filterNewlinesAdjacentToParagraphs(transformedChildren);

	return transformedChildren;
}

// Default TSDoc implementation only supports the following DocNode kinds under a section node:
// - DocNodeKind.FencedCode,
// - DocNodeKind.Paragraph,
// - DocNodeKind.HtmlStartTag,
// - DocNodeKind.HtmlEndTag
function transformTsdocSectionContent(
	node: DocNode,
	options: TsdocNodeTransformOptions,
): BlockContent[] {
	switch (node.kind) {
		case DocNodeKind.FencedCode: {
			return [transformTsdocFencedCode(node as DocFencedCode, options)];
		}
		case DocNodeKind.HtmlStartTag:
		case DocNodeKind.HtmlEndTag: {
			return transformTsdocHtmlTag(node as DocHtmlStartTag | DocHtmlEndTag, options);
		}
		case DocNodeKind.Paragraph: {
			return [transformTsdocParagraph(node as DocParagraph, options)];
		}
		default: {
			options.logger?.error(
				`Unsupported DocNode kind under section node: "${node.kind}".`,
				node,
			);
			return [];
		}
	}
}

/**
 * Converts a {@link @microsoft/tsdoc#DocParagraph} to a {@link ParagraphNode}.
 *
 * @remarks
 * Also performs the following cleanup steps:
 *
 * 1. Collapses groups of adjacent newline nodes to reduce clutter.
 *
 * 2. Remove line break nodes adjacent to paragraph nodes.
 *
 * 3. Remove leading and trailing line breaks within the paragraph (see
 * {@link trimLeadingAndTrailingLineBreaks}).
 *
 * 4. Trim leading whitespace from first child if it is plain-text, and trim trailing whitespace from
 * last child if it is plain-text.
 */
export function transformTsdocParagraph(
	node: DocParagraph,
	options: TsdocNodeTransformOptions,
): ParagraphNode {
	// TODO: HTML contents come in as a start tag, followed by the content, followed by an end tag, rather than something with hierarchy.
	// To ensure we map the content correctly, we should scan the child list for matching open/close tags,
	// and map the subsequence to an "html" node.

	// Transform child items into Documentation domain
	let transformedChildren: PhrasingContent[] = [];
	for (const child of node.nodes) {
		transformedChildren.push(...transformTsdocParagraphContent(child, options));
	}

	// Filter out `undefined` values resulting from transformation errors.
	transformedChildren = transformedChildren.filter(
		(child) => child !== undefined && !child.isEmpty,
	);

	// Collapse groups of adjacent line breaks to reduce unnecessary clutter in the output.
	transformedChildren = collapseAdjacentLineBreaks(transformedChildren);

	// Trim leading and trailing line breaks, which are effectively redundant
	transformedChildren = trimLeadingAndTrailingLineBreaks(transformedChildren);

	// Trim leading whitespace from first child if it is plain text,
	// and trim trailing whitespace from last child if it is plain text.
	if (transformedChildren.length > 0) {
		if (transformedChildren[0].type === DocumentationNodeType.PlainText) {
			const plainTextNode = transformedChildren[0];
			transformedChildren[0] = new PlainTextNode(
				plainTextNode.value.trimStart(),
				plainTextNode.escaped,
			);
		}
		if (
			transformedChildren[transformedChildren.length - 1].type ===
			DocumentationNodeType.PlainText
		) {
			const plainTextNode = transformedChildren[
				transformedChildren.length - 1
			] as PlainTextNode;
			transformedChildren[transformedChildren.length - 1] = new PlainTextNode(
				plainTextNode.value.trimEnd(),
				plainTextNode.escaped,
			);
		}
	}

	return new ParagraphNode(transformedChildren);
}

/*
DocNodeKind.BlockTag,
DocNodeKind.CodeSpan,
DocNodeKind.ErrorText,
DocNodeKind.EscapedText,
DocNodeKind.HtmlStartTag,
DocNodeKind.HtmlEndTag,
DocNodeKind.InlineTag,
DocNodeKind.LinkTag,
DocNodeKind.PlainText,
DocNodeKind.SoftBreak
*/
function transformTsdocParagraphContent(
	node: DocNode,
	options: TsdocNodeTransformOptions,
): PhrasingContent[] {
	switch (node.kind) {
		case DocNodeKind.CodeSpan: {
			return [transformTsdocCodeSpan(node as DocCodeSpan, options)];
		}
		case DocNodeKind.EscapedText: {
			return [transformTsdocEscapedText(node as DocEscapedText, options)];
		}
		case DocNodeKind.HtmlStartTag:
		case DocNodeKind.HtmlEndTag: {
			return transformTsdocHtmlTag(node as DocHtmlStartTag | DocHtmlEndTag, options);
		}
		case DocNodeKind.InheritDocTag: {
			options.logger?.error(
				`Encountered inheritDoc tag. This is not expected. Such tags should have already undergone content replacement.`,
			);
			return [];
		}
		case DocNodeKind.InlineTag: {
			const transformed = transformTsdocInlineTag(node as DocInlineTag);
			return transformed === undefined ? [] : [transformed];
		}
		case DocNodeKind.LinkTag: {
			return [transformTsdocLinkTag(node as DocLinkTag, options)];
		}
		case DocNodeKind.PlainText: {
			return [transformTsdocPlainText(node as DocPlainText, options)];
		}
		case DocNodeKind.SoftBreak: {
			return [LineBreakNode.Singleton];
		}
		default: {
			options.logger?.error(`Unsupported DocNode kind: "${node.kind}".`, node);
			return [];
		}
	}
}

/**
 * Converts a {@link @microsoft/tsdoc#DocCodeSpan} to a {@link CodeSpanNode}.
 */
export function transformTsdocCodeSpan(
	node: DocCodeSpan,
	options: TsdocNodeTransformOptions,
): CodeSpanNode {
	return CodeSpanNode.createFromPlainText(node.code.trim());
}

/**
 * Handler for TSDoc HTML tag nodes.
 *
 * @remarks
 *
 * This library has made the policy choice to not support embedded HTML content.
 * Instead, we will emit a warning and ignore the HTML tags (return `undefined`).
 * "Contained" content (represented as adjacent nodes in the list, appearing between the start and end tag nodes) will
 * be transformed as normal.
 *
 * This matches intellisense's policy for HTML in TSDoc/JSDoc comments.
 *
 * We may revisit this in the future.
 */
export function transformTsdocHtmlTag(
	node: DocHtmlStartTag | DocHtmlEndTag,
	options: TsdocNodeTransformOptions,
): [] {
	const tag = node.emitAsHtml();
	options.logger?.warning(
		`Encountered an HTML tag: "${tag}". This library does not support embedded HTML content. Inner contents will be mapped as normal, but the HTML tags will be ignored.`,
	);
	return [];
}

/**
 * Converts a {@link @microsoft/tsdoc#DocPlainText} to a {@link PlainTextNode}.
 */
export function transformTsdocPlainText(
	node: DocPlainText,
	options: TsdocNodeTransformOptions,
): PlainTextNode {
	return new PlainTextNode(node.text);
}

/**
 * Converts a {@link @microsoft/tsdoc#DocEscapedText} to a {@link PlainTextNode}.
 */
export function transformTsdocEscapedText(
	node: DocEscapedText,
	options: TsdocNodeTransformOptions,
): PlainTextNode {
	return new PlainTextNode(node.encodedText, /* escaped: */ true);
}

/**
 * Converts a {@link @microsoft/tsdoc#DocPlainText} to a {@link PlainTextNode}.
 */
export function transformTsdocFencedCode(
	node: DocFencedCode,
	options: TsdocNodeTransformOptions,
): FencedCodeBlockNode {
	return FencedCodeBlockNode.createFromPlainText(node.code.trim(), node.language);
}

/**
 * Converts a {@link @microsoft/tsdoc#DocPlainText} to a {@link SingleLineDocumentationNode}.
 */
export function transformTsdocLinkTag(
	input: DocLinkTag,
	options: TsdocNodeTransformOptions,
): LinkNode | SingleLineSpanNode {
	if (input.codeDestination !== undefined) {
		const link = options.resolveApiReference(input.codeDestination);

		if (link === undefined) {
			// If the code link could not be resolved, print the unresolved text in italics.
			const linkText = input.linkText?.trim() ?? input.codeDestination.emitAsTsdoc().trim();
			return SingleLineSpanNode.createFromPlainText(linkText, { italic: true });
		} else {
			const linkText = input.linkText?.trim() ?? link.text;
			const linkTarget = link.target;
			return LinkNode.createFromPlainText(linkText, linkTarget);
		}
	}

	if (input.urlDestination !== undefined) {
		// If link text was not provided, use the name of the referenced element.
		const linkText = input.linkText ?? input.urlDestination;

		return LinkNode.createFromPlainText(linkText, input.urlDestination);
	}

	throw new Error(
		`DocLinkTag contained neither a URL destination nor a code destination, which is not expected.`,
	);
}

/**
 * Converts a {@link @microsoft/tsdoc#DocInlineTag} to a {@link SpanNode} (or `undefined` if the input is a `{@label}` tag).
 *
 * @remarks
 * Custom inline tags are not something the system can do anything with inherently.
 * In the future, we may be able to add extensibility points for transforming custom inline tags.
 * But for now, we will simply emit them as italicized plain text in the output.
 *
 * Notes:
 *
 * * `{@link}` tags are handled separately via {@link transformTsdocLinkTag}.
 *
 * * `{@inheritDoc}` tags are resolved when loading the API model via simple content replacement.
 * We do not expect to see them at this stage.
 *
 * * `{@label}` tags aren't really intended to appear in output; they're used as extra metadata
 * for use in `{@link}` and `{@inheritDoc}` tags, so we will simply ignore them here. I.e. we
 * will return `undefined`.
 */
export function transformTsdocInlineTag(node: DocInlineTag): SpanNode | undefined {
	if (node.tagName === "@label") {
		return undefined;
	}

	// For all other inline tags, there isn't really anything we can do with them except emit them
	// as is. However, to help differentiate them in the output, we will italicize them.
	return SpanNode.createFromPlainText(`{${node.tagName} ${node.tagContent}}`, {
		italic: true,
	});
}

/**
 * Collapses adjacent groups of 1+ line break nodes into a single line break node to reduce clutter
 * in output tree.
 */
function collapseAdjacentLineBreaks(nodes: readonly PhrasingContent[]): PhrasingContent[] {
	if (nodes.length === 0) {
		return [];
	}

	const result: PhrasingContent[] = [];
	let onNewline = false;
	for (const node of nodes) {
		if (node.type === DocumentationNodeType.LineBreak) {
			if (onNewline) {
				continue;
			} else {
				onNewline = true;
				result.push(node);
			}
		} else {
			onNewline = false;
			result.push(node);
		}
	}

	return result;
}

/**
 * Trims an line break nodes found at the beginning or end of the list.
 *
 * @remarks Useful for cleaning up {@link ParagraphNode} child contents, since leading and trailing
 * newlines are effectively redundant.
 */
function trimLeadingAndTrailingLineBreaks(
	nodes: readonly PhrasingContent[],
): PhrasingContent[] {
	if (nodes.length === 0) {
		return [];
	}

	let startIndex = 0;
	let endIndex = nodes.length - 1;

	for (const node of nodes) {
		if (node.type === DocumentationNodeType.LineBreak) {
			startIndex++;
		} else {
			break;
		}
	}

	for (let i = nodes.length - 1; i > startIndex; i--) {
		if (nodes[i].type === DocumentationNodeType.LineBreak) {
			endIndex--;
		} else {
			break;
		}
	}

	return nodes.slice(startIndex, endIndex + 1);
}

/**
 * Filters out line break nodes that are adjacent to paragraph nodes.
 * Since paragraph nodes inherently create line breaks on either side, these nodes are redundant and
 * clutter the output tree.
 */
function filterNewlinesAdjacentToParagraphs(nodes: readonly BlockContent[]): BlockContent[] {
	if (nodes.length === 0) {
		return [];
	}

	const result: BlockContent[] = [];
	for (let i = 0; i < nodes.length; i++) {
		if (nodes[i].type === DocumentationNodeType.LineBreak) {
			const previousIsParagraph =
				i > 0 ? nodes[i - 1].type === DocumentationNodeType.Paragraph : false;
			const nextIsParagraph =
				i < nodes.length - 1 ? nodes[i + 1].type === DocumentationNodeType.Paragraph : false;
			if (previousIsParagraph || nextIsParagraph) {
				continue;
			}
		}
		result.push(nodes[i]);
	}
	return result;
}
