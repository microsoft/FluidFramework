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
	type DocEscapedText,
} from "@microsoft/tsdoc";
import type {
	Break,
	BlockContent,
	Code,
	InlineCode,
	List,
	ListItem,
	Paragraph,
	PhrasingContent,
	Text,
} from "mdast";

import type { Link } from "../Link.js";
import type { LoggingConfiguration } from "../LoggingConfiguration.js";
import { MarkdownBlockContentNode } from "../documentation-domain/index.js";

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
 * Converts a {@link @microsoft/tsdoc#DocSection} to a list of {@link MarkdownBlockContentNode}s.
 *
 * @public
 */
export function transformAndWrapTsdoc(
	node: DocSection,
	contextApiItem: ApiItem,
	config: ApiItemTransformationConfiguration,
): MarkdownBlockContentNode[] {
	const contents = transformTsdoc(node, contextApiItem, config);
	return contents.map((mdastTree) => new MarkdownBlockContentNode(mdastTree));
}

/**
 * Converts a {@link @microsoft/tsdoc#DocSection} to a list of {@link BlockContent}s.
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
			options.logger.error(
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
function transformTsdocParagraph(
	node: DocParagraph,
	options: TsdocNodeTransformOptions,
): (Paragraph | List)[] {
	// TODO: HTML contents come in as a start tag, followed by the content, followed by an end tag, rather than something with hierarchy.
	// To ensure we map the content correctly, we should scan the child list for matching open/close tags,
	// and map the subsequence to an "html" node.

	// Trim leading and trailing line breaks, which are redundant in the context of a paragraph.
	const adjustedChildren = trimLeadingAndTrailingLineBreaks(node.nodes);

	// Transform child items into Documentation domain
	const transformedChildren: PhrasingContent[] = [];
	for (const child of adjustedChildren) {
		transformedChildren.push(...transformTsdocParagraphContent(child, options));
	}

	// Trim leading whitespace from first child if it is plain text,
	// and trim trailing whitespace from last child if it is plain text.
	if (transformedChildren.length > 0) {
		if (transformedChildren[0].type === "text") {
			const text = transformedChildren[0];
			transformedChildren[0] = { type: "text", value: text.value.trimStart() };
		}
		if (transformedChildren[transformedChildren.length - 1].type === "text") {
			const text = transformedChildren[transformedChildren.length - 1];
			transformedChildren[transformedChildren.length - 1] = {
				type: "text",
				value: (text as Text).value.trimEnd(),
			};
		}
	}

	if (transformedChildren.length === 0) {
		return [];
	}

	return parseContentAsBlock(transformedChildren);
}

/**
 * Line break singleton
 */
const lineBreak: Break = {
	type: "break",
};

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
			return [lineBreak];
		}
		default: {
			options.logger.error(
				`Unsupported DocNode kind under paragraph node: "${node.kind}".`,
				node,
			);
			return [];
		}
	}
}

/**
 * Converts a {@link @microsoft/tsdoc#DocCodeSpan} to a {@link CodeSpanNode}.
 */
function transformTsdocCodeSpan(
	node: DocCodeSpan,
	options: TsdocNodeTransformOptions,
): InlineCode {
	return {
		type: "inlineCode",
		value: node.code.trim(),
	};
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
): Text {
	return {
		type: "text",
		value: node.text,
	};
}

/**
 * Converts a {@link @microsoft/tsdoc#DocEscapedText} to a {@link PlainTextNode}.
 */
function transformTsdocEscapedText(
	node: DocEscapedText,
	options: TsdocNodeTransformOptions,
): Text {
	return {
		type: "text",
		value: node.decodedText,
	};
}

/**
 * Converts a {@link @microsoft/tsdoc#DocPlainText} to a {@link PlainTextNode}.
 */
function transformTsdocFencedCode(
	node: DocFencedCode,
	options: TsdocNodeTransformOptions,
): Code {
	return {
		type: "code",
		value: node.code.trim(),
		lang: node.language,
	};
}

/**
 * Converts a {@link @microsoft/tsdoc#DocPlainText} to a {@link SingleLineDocumentationNode}.
 */
function transformTsdocLinkTag(
	input: DocLinkTag,
	options: TsdocNodeTransformOptions,
): PhrasingContent {
	if (input.codeDestination !== undefined) {
		const link = options.resolveApiReference(input.codeDestination);

		if (link === undefined) {
			// If the code link could not be resolved, print the unresolved text in italics.
			const linkText = input.linkText?.trim() ?? input.codeDestination.emitAsTsdoc().trim();
			return {
				type: "emphasis",
				children: [
					{
						type: "text",
						value: linkText,
					},
				],
			};
		} else {
			const linkText = input.linkText?.trim() ?? link.text;
			const linkTarget = link.target;
			return {
				type: "link",
				url: linkTarget,
				children: [
					{
						type: "text",
						value: linkText,
					},
				],
			};
		}
	}

	if (input.urlDestination !== undefined) {
		// If link text was not provided, use the name of the referenced element.
		const linkText = input.linkText ?? input.urlDestination;
		return {
			type: "link",
			url: input.urlDestination,
			children: [
				{
					type: "text",
					value: linkText,
				},
			],
		};
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
function transformTsdocInlineTag(node: DocInlineTag): PhrasingContent | undefined {
	if (node.tagName === "@label") {
		return undefined;
	}

	// For all other inline tags, there isn't really anything we can do with them except emit them
	// as is. However, to help differentiate them in the output, we will italicize them.
	return {
		type: "emphasis",
		children: [
			{
				type: "text",
				value: `{${node.tagName} ${node.tagContent}}`,
			},
		],
	};
}

/**
 * Single space text singleton.
 */
const space: Text = {
	type: "text",
	value: " ",
};

/**
 * Parse the provided list of {@link PhrasingContent} into a list of {@link ParagraphNode} or {@link ListNode}, following Markdown syntax rules.
 *
 * @remarks This is a workaround for TSDoc not parsing its input as Markdown.
 * We add explicit support for lists as a post-processing step.
 */
function parseContentAsBlock(nodes: PhrasingContent[]): (Paragraph | List)[] {
	// #region Step 1: parse source lines into lines of non-lists (paragraphs) and list items

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
		readonly indentationLevel: number;
		readonly content: PhrasingContent[];
	}

	interface ParsedOrderedListItem {
		readonly type: "orderedListItem";
		readonly delimiter: "." | ")";
		readonly indentationLevel: number;
		readonly content: PhrasingContent[];
	}

	type ParsedLine = ParsedParagraphLine | ParsedUnorderedListItem | ParsedOrderedListItem;

	const parsedSourceLines: ParsedLine[] = [];
	let currentLineState: ParsedLine | undefined;
	for (const node of nodes) {
		if (currentLineState === undefined) {
			// Case: new line
			if (node.type === "text") {
				// If the line starts with a text node, we will check if it matches the list item pattern.
				// If it does, we will treat this line as the start of a list.
				// If not, we will treat it as the start of a paragraph.
				const match = node.value.match(regex);
				if (match) {
					// If we are at the beginning of a line, and the beginning text matches the list item pattern,
					// we will treat this line as a list item.
					const leadingWhitespace = match[1];
					const listItemDelimiter = match[2];
					const listItemContent = match[3];

					// Determine if the list item is ordered or unordered.
					// Note: Markdown does not preserve explicit numbering, so we
					// don't need to keep track of the parsed numbers here.
					const orderedListItemDelimiterMatch = listItemDelimiter.match(/^\d+([).])$/);

					const leadingWhitespaceModified = leadingWhitespace.replace(/\t/g, "  ");
					const indentationLevel = leadingWhitespaceModified.length / 2; // Assuming 2 spaces per indentation level

					currentLineState = orderedListItemDelimiterMatch
						? {
								type: "orderedListItem",
								delimiter: orderedListItemDelimiterMatch[1] as "." | ")",
								indentationLevel,
								content: [{ type: "text", value: listItemContent }],
							}
						: {
								type: "unorderedListItem",
								delimiter: listItemDelimiter as "*" | "+" | "-",
								indentationLevel,
								content: [{ type: "text", value: listItemContent }],
							};
				} else {
					// If the line doesn't start with the list item pattern, we will treat the line as the start of a paragraph.
					currentLineState = {
						type: "paragraphLine",
						content: [node],
					};
				}
			} else {
				currentLineState = {
					type: "paragraphLine",
					content: [node],
				};
			}
		} else {
			// Case: continuation of the current line
			if (node.type === "break") {
				// When we encounter a line break, we will finalize the current line content.
				parsedSourceLines.push(currentLineState);
				currentLineState = undefined;
			} else {
				// Push any non-line-break content to the current line.
				currentLineState.content.push(node);
			}
		}
	}
	if (currentLineState !== undefined) {
		parsedSourceLines.push(currentLineState);
	}

	// #endregion

	// #region Step 2: convert parsed source lines into "output" lines following Markdown rules

	// This step converts adjacent "lines" from the source into output lines.
	// In Markdown, soft line breaks between non-list content are rendered as a single space.
	// This step folds all adjacent simple text lines into their preceding list or paragraph line.

	const outputLines: ParsedLine[] = [];
	let iParsed = 0;
	while (iParsed < parsedSourceLines.length) {
		const current = parsedSourceLines[iParsed];
		iParsed++;
		switch (current.type) {
			case "orderedListItem":
			case "unorderedListItem": {
				// Merge paragraph lines following list items into the list item.
				// Soft line breaks between them are converted to a single space, as in Markdown.
				const items: PhrasingContent[] = [...current.content];
				while (
					iParsed < parsedSourceLines.length &&
					parsedSourceLines[iParsed].type === "paragraphLine"
				) {
					if (items.length > 0) {
						// Add a space between content on adjacent lines in the same paragraph.
						items.push(space);
					}
					items.push(...parsedSourceLines[iParsed].content);
					iParsed++;
				}
				outputLines.push({
					...current,
					content: combineAdjacentPlainText(items),
				});
				break;
			}
			case "paragraphLine": {
				// Combine adjacent "paragraph lines" together into a single paragraph node.
				// Soft line breaks between them are converted to a single space, as in Markdown.
				const items: PhrasingContent[] = [...current.content];
				while (
					iParsed < parsedSourceLines.length &&
					parsedSourceLines[iParsed].type === "paragraphLine"
				) {
					if (items.length > 0) {
						// Add a space between content on adjacent lines in the same paragraph.
						items.push(space);
					}
					items.push(...parsedSourceLines[iParsed].content);
					iParsed++;
				}
				// Create a single ParagraphNode from the merged lines.
				outputLines.push({
					type: "paragraphLine",
					content: combineAdjacentPlainText(items),
				});
				break;
			}
			// No default
		}
	}

	// #endregion

	// #region Step 3: group list items into lists

	// The previous step produced a list of lines in terms of output.
	// For simple paragraphs, there is a 1:1 mapping between output lines and ParagraphNodes.
	// But for lists, we need to group adjacent list items together into a single ListNode.
	// This step performs that grouping.

	// Note: for now, this code ignores indentation levels.
	// This means that all adjacent list items are treated as separate items in a single root list.
	// This is sufficient for our needs at the moment, but in the future we should add support for parsing nested lists.

	const result: (Paragraph | List)[] = [];
	let iOutput = 0;
	while (iOutput < outputLines.length) {
		const current = outputLines[iOutput];

		switch (current.type) {
			case "paragraphLine": {
				result.push({ type: "paragraph", children: current.content });
				iOutput++;
				break;
			}
			case "orderedListItem":
			case "unorderedListItem": {
				const items: ListItem[] = [];
				while (
					iOutput < outputLines.length &&
					outputLines[iOutput].type === current.type &&
					(outputLines[iOutput] as ParsedOrderedListItem | ParsedUnorderedListItem)
						.delimiter === current.delimiter
				) {
					items.push({
						type: "listItem",
						children: [
							{
								type: "paragraph",
								children: combineAdjacentPlainText(outputLines[iOutput].content),
							},
						],
					});
					iOutput++;
				}
				result.push({
					type: "list",
					ordered: current.type === "orderedListItem",
					children: items,
					spread: false,
				});
				break;
			}
			// No default
		}
	}

	// #endregion

	return result;
}

/**
 * Collapses adjacent groups of 1+ {@link PlainTextNode}s into a single line break node to reduce clutter
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
				result.push({ type: "text", value: buffer });
				buffer = "";
			}
			result.push(node);
		}
	}
	if (buffer.length > 0) {
		result.push({ type: "text", value: buffer });
	}

	return result;
}

/**
 * Trims an line break nodes found at the beginning or end of the list.
 *
 * @remarks Useful for cleaning up {@link ParagraphNode} child contents, since leading and trailing
 * newlines are effectively redundant.
 */
function trimLeadingAndTrailingLineBreaks(nodes: readonly DocNode[]): DocNode[] {
	if (nodes.length === 0) {
		return [];
	}

	let startIndex = 0;
	let endIndex = nodes.length - 1;

	for (const node of nodes) {
		if (node.kind === DocNodeKind.SoftBreak) {
			startIndex++;
		} else {
			break;
		}
	}

	for (let i = nodes.length - 1; i > startIndex; i--) {
		if (nodes[i].kind === DocNodeKind.SoftBreak) {
			endIndex--;
		} else {
			break;
		}
	}

	return nodes.slice(startIndex, endIndex + 1);
}
