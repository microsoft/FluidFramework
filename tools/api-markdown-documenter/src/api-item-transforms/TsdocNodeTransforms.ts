/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ApiItem } from "@microsoft/api-extractor-model";
import {
	type DocCodeSpan,
	type DocDeclarationReference,
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
	FencedCodeBlockNode,
	LineBreakNode,
	LinkNode,
	ListItemNode,
	ListNode,
	ParagraphNode,
	type PhrasingContent,
	PlainTextNode,
	SpanNode,
} from "../documentation-domain/index.js";

import { resolveSymbolicLink } from "./Utilities.js";
import type { ApiItemTransformationConfiguration } from "./configuration/index.js";

/**
 * Library of transformations from {@link https://github.com/microsoft/tsdoc/blob/main/tsdoc/src/nodes/DocNode.ts| DocNode}s
 * to {@link DocumentationNode}s.
 */

/**
 * Options for {@link @microsoft/tsdoc#DocNode} transformations.
 */
export interface TsdocNodeTransformOptions extends Required<LoggingConfiguration> {
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
 * Create {@link TsdocNodeTransformOptions} for the provided context API item and the system config.
 *
 * @param contextApiItem - See {@link TsdocNodeTransformOptions.contextApiItem}.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 *
 * @returns An option for {@link @microsoft/tsdoc#DocNode} transformations
 */
function getTsdocNodeTransformationOptions(
	contextApiItem: ApiItem,
	config: ApiItemTransformationConfiguration,
): TsdocNodeTransformOptions {
	return {
		contextApiItem,
		resolveApiReference: (codeDestination): Link | undefined =>
			resolveSymbolicLink(contextApiItem, codeDestination, config),
		logger: config.logger,
	};
}

/**
 * Converts a {@link @microsoft/tsdoc#DocSection} to a {@link SectionNode}.
 *
 * @public
 */
export function transformTsdoc(
	node: DocSection,
	contextApiItem: ApiItem,
	config: ApiItemTransformationConfiguration,
): BlockContent[] {
	const tsdocTransformConfig = getTsdocNodeTransformationOptions(contextApiItem, config);
	return transformTsdocSection(node, tsdocTransformConfig);
}

/**
 * Converts a {@link @microsoft/tsdoc#DocSection} to a {@link SectionNode}.
 * @remarks Exported only for testing purposes.
 */
export function transformTsdocSection(
	node: DocSection,
	options: TsdocNodeTransformOptions,
): BlockContent[] {
	// TODO: HTML contents come in as a start tag, followed by the content, followed by an end tag, rather than something with hierarchy.
	// To ensure we map the content correctly, we should scan the child list for matching open/close tags,
	// and map the subsequence to an "html" node.

	const transformedChildren: BlockContent[] = [];
	for (const child of node.nodes) {
		transformedChildren.push(...transformTsdocSectionContent(child, options));
	}

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
			return transformTsdocParagraph(node as DocParagraph, options);
		}
		default: {
			// TODO
			throw new Error(`Unsupported DocNode kind under section node: "${node.kind}".`);
			// options.logger?.error(
			// 	`Unsupported DocNode kind under section node: "${node.kind}".`,
			// 	node,
			// );
			// return [];
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
function transformTsdocParagraph(
	node: DocParagraph,
	options: TsdocNodeTransformOptions,
): (ParagraphNode | ListNode)[] {
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

	// Trim leading and trailing line breaks, which are redundant in the context of a paragraph.
	transformedChildren = trimLeadingAndTrailingLineBreaks(transformedChildren);

	// Trim leading whitespace from first child if it is plain text,
	// and trim trailing whitespace from last child if it is plain text.
	if (transformedChildren.length > 0) {
		if (transformedChildren[0].type === "text") {
			const plainTextNode = transformedChildren[0];
			transformedChildren[0] = new PlainTextNode(plainTextNode.value.trimStart());
		}
		if (transformedChildren[transformedChildren.length - 1].type === "text") {
			const plainTextNode = transformedChildren[
				transformedChildren.length - 1
			] as PlainTextNode;
			transformedChildren[transformedChildren.length - 1] = new PlainTextNode(
				plainTextNode.value.trimEnd(),
			);
		}
	}

	if (transformedChildren.length === 0) {
		return [];
	}

	return listify(transformedChildren);
}

// Default TSDoc implementation only supports the following DocNode kinds under a section node:
// - DocNodeKind.BlockTag,
// - DocNodeKind.CodeSpan,
// - DocNodeKind.ErrorText,
// - DocNodeKind.EscapedText,
// - DocNodeKind.HtmlStartTag,
// - DocNodeKind.HtmlEndTag,
// - DocNodeKind.InlineTag,
// - DocNodeKind.LinkTag,
// - DocNodeKind.PlainText,
// - DocNodeKind.SoftBreak
function transformTsdocParagraphContent(
	node: DocNode,
	options: TsdocNodeTransformOptions,
): PhrasingContent[] {
	switch (node.kind) {
		case DocNodeKind.CodeSpan: {
			return [transformTsdocCodeSpan(node as DocCodeSpan, options)];
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
			// TODO
			throw new Error(`Unsupported DocNode kind under paragraph node: "${node.kind}".`);
			// options.logger?.error(
			// 	`Unsupported DocNode kind under paragraph node: "${node.kind}".`,
			// 	node,
			// );
			// return [];
		}
	}
}

/**
 * Converts a {@link @microsoft/tsdoc#DocCodeSpan} to a {@link CodeSpanNode}.
 */
function transformTsdocCodeSpan(
	node: DocCodeSpan,
	options: TsdocNodeTransformOptions,
): CodeSpanNode {
	return new CodeSpanNode(node.code.trim());
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
function transformTsdocHtmlTag(
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
function transformTsdocPlainText(
	node: DocPlainText,
	options: TsdocNodeTransformOptions,
): PlainTextNode {
	return new PlainTextNode(node.text);
}

/**
 * Converts a {@link @microsoft/tsdoc#DocPlainText} to a {@link PlainTextNode}.
 */
function transformTsdocFencedCode(
	node: DocFencedCode,
	options: TsdocNodeTransformOptions,
): FencedCodeBlockNode {
	return FencedCodeBlockNode.createFromPlainText(node.code.trim(), node.language);
}

/**
 * Converts a {@link @microsoft/tsdoc#DocPlainText} to a {@link SingleLineDocumentationNode}.
 */
function transformTsdocLinkTag(
	input: DocLinkTag,
	options: TsdocNodeTransformOptions,
): LinkNode | SpanNode {
	if (input.codeDestination !== undefined) {
		const link = options.resolveApiReference(input.codeDestination);

		if (link === undefined) {
			// If the code link could not be resolved, print the unresolved text in italics.
			const linkText = input.linkText?.trim() ?? input.codeDestination.emitAsTsdoc().trim();
			return SpanNode.createFromPlainText(linkText, { italic: true });
		} else {
			const linkText = input.linkText?.trim() ?? link.text;
			const linkTarget = link.target;
			return new LinkNode(linkText, linkTarget);
		}
	}

	if (input.urlDestination !== undefined) {
		// If link text was not provided, use the name of the referenced element.
		const linkText = input.linkText ?? input.urlDestination;

		return new LinkNode(linkText, input.urlDestination);
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
function transformTsdocInlineTag(node: DocInlineTag): SpanNode | undefined {
	if (node.tagName === "@label") {
		return undefined;
	}

	// For all other inline tags, there isn't really anything we can do with them except emit them
	// as is. However, to help differentiate them in the output, we will italicize them.
	return SpanNode.createFromPlainText(`{${node.tagName} ${node.tagContent}}`, {
		italic: true,
	});
}

function listify(nodes: PhrasingContent[]): (ParagraphNode | ListNode)[] {
	// #region Step 1: split parsed lines into lines of non-lists (paragraphs) and list items

	// This regex matches lines that look like Markdown list items:
	// - It starts with optional whitespace (\s*)
	// - Then either a bullet (*, +, or -) or a numbered list (digits followed by ')' or '.')
	// - Followed by at least one whitespace (\s+)
	// Examples matched: "  * item", "1. item", "- item", "  2) item"
	const regex = /^(\s*)([*+-]|\d+[).])\s+(.*?)$/;

	interface ParsedParagraphLine {
		readonly type: "paragraphLine";
		readonly content: PhrasingContent[];
	}

	interface ParsedUnorderedListItem {
		readonly type: "unorderedListItem";
		readonly delimiter: "*" | "+" | "-";
		readonly indentation: string;
		readonly content: PhrasingContent[];
	}

	interface ParsedOrderedListItem {
		readonly type: "orderedListItem";
		readonly delimiterValue: number;
		readonly indentation: string;
		readonly content: PhrasingContent[];
	}

	type ParsedLine = ParsedParagraphLine | ParsedUnorderedListItem | ParsedOrderedListItem;

	const parsed: ParsedLine[] = [];

	let lineState: ParsedLine | undefined;
	for (const node of nodes) {
		if (lineState === undefined) {
			if (node.type === "text") {
				const match = node.value.match(regex);
				if (match) {
					// If we are at the beginning of a line, and the beginning text matches the list item pattern,
					// we will treat this line as a list item.
					const leadingWhitespace = match[1];
					const listItemDelimiter = match[2];
					const listItemContent = match[3];

					// Determine if the list item is ordered or unordered.
					const delimiterMatch = listItemDelimiter.match(/^(\d+)[).]$/);
					lineState = delimiterMatch
						? {
								type: "orderedListItem",
								delimiterValue: Number.parseInt(delimiterMatch[1], 10),
								indentation: leadingWhitespace,
								content: [new PlainTextNode(listItemContent)],
							}
						: {
								type: "unorderedListItem",
								delimiter: listItemDelimiter as "*" | "+" | "-",
								indentation: leadingWhitespace,
								content: [new PlainTextNode(listItemContent)],
							};
				} else {
					// If the line doesn't start with the list item pattern, we will treat the line as a paragraph.
					lineState = {
						type: "paragraphLine",
						content: [node],
					};
				}
			} else {
				lineState = {
					type: "paragraphLine",
					content: [node],
				};
			}
		} else {
			if (node.type === "lineBreak") {
				// When we encounter a line break, we will finalize the current line content.
				parsed.push(lineState);
				lineState = undefined;
			} else {
				lineState.content.push(node);
			}
		}
	}
	if (lineState !== undefined) {
		parsed.push(lineState);
	}

	// #endregion

	// #region Step 2: group list items into lists

	// TODO: group lists by indentation level, so that we can support nested lists.

	const result: (ParagraphNode | ListNode)[] = [];
	let i = 0;
	while (i < parsed.length) {
		const current = parsed[i];

		switch (current.type) {
			case "paragraphLine": {
				// Adjacent "paragraph lines" are combined together into a single paragraph node.
				// Soft line breaks between them are converted to a single space.
				const items: PhrasingContent[] = [];
				while (i < parsed.length && parsed[i].type === "paragraphLine") {
					if (items.length > 0) {
						// Add a space between content on adjacent lines in the same paragraph.
						items.push(new PlainTextNode(" "));
					}
					items.push(...parsed[i].content);
					i++;
				}

				result.push(new ParagraphNode(combineAdjacentPlainText(items)));

				break;
			}
			case "orderedListItem": {
				// TODO: preserve numbering.
				// const delimiterValue = current.delimiterValue;
				const items: ListItemNode[] = [];
				while (i < parsed.length && parsed[i].type === "orderedListItem") {
					items.push(new ListItemNode(combineAdjacentPlainText(parsed[i].content)));
					i++;
				}
				result.push(new ListNode(items, true));

				break;
			}
			case "unorderedListItem": {
				const delimiter = current.delimiter;
				const items: ListItemNode[] = [];
				while (
					i < parsed.length &&
					parsed[i].type === "unorderedListItem" &&
					(parsed[i] as ParsedUnorderedListItem).delimiter === delimiter
				) {
					items.push(new ListItemNode(combineAdjacentPlainText(parsed[i].content)));
					i++;
				}
				result.push(new ListNode(items, false));

				break;
			}
			// No default
		}
	}

	// #endregion

	return result;
}

/**
 * Collapses adjacent groups of 1+ line break nodes into a single line break node to reduce clutter
 * in output tree.
 */
function combineAdjacentPlainText(nodes: readonly PhrasingContent[]): PhrasingContent[] {
	if (nodes.length === 0) {
		return [];
	}

	const result: PhrasingContent[] = [];
	let buffer = "";
	for (const node of nodes) {
		if (node.type === "text") {
			buffer += node.value;
		} else {
			if (buffer.length > 0) {
				result.push(new PlainTextNode(buffer));
				buffer = "";
			}
			result.push(node);
		}
	}
	if (buffer.length > 0) {
		result.push(new PlainTextNode(buffer));
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
		if (node.type === "lineBreak") {
			startIndex++;
		} else {
			break;
		}
	}

	for (let i = nodes.length - 1; i > startIndex; i--) {
		if (nodes[i].type === "lineBreak") {
			endIndex--;
		} else {
			break;
		}
	}

	return nodes.slice(startIndex, endIndex + 1);
}
