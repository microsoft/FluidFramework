/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	type AlertNode,
	type BlockQuoteNode,
	type CodeSpanNode,
	type DocumentationNode,
	DocumentationNodeType,
	type FencedCodeBlockNode,
	type HeadingNode,
	type HorizontalRuleNode,
	type LineBreakNode,
	type LinkNode,
	type OrderedListNode,
	type ParagraphNode,
	type PlainTextNode,
	type SectionNode,
	type SpanNode,
	type TableCellNode,
	type TableNode,
	type TableRowNode,
	type UnorderedListNode,
} from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import type { MarkdownRenderContext } from "../RenderContext";
import {
	renderAlert,
	renderBlockQuote,
	renderCodeSpan,
	renderFencedCodeBlock,
	renderHeading,
	renderHierarchicalSection,
	renderHorizontalRule,
	renderLineBreak,
	renderLink,
	renderOrderedList,
	renderParagraph,
	renderPlainText,
	renderSpan,
	renderTable,
	renderTableCell,
	renderTableRow,
	renderUnorderedList,
} from "../default-renderers";

/**
 * {@link DocumentationNode} renderer type-signature.
 *
 * @param node - The `DocumentationNode` to render.
 * @param writer - The writing context to render into.
 * @param context - Recursive contextual state.
 *
 * @public
 */
export type RenderDocumentationNode<
	TDocumentationNode extends DocumentationNode = DocumentationNode,
> = (node: TDocumentationNode, writer: DocumentWriter, context: MarkdownRenderContext) => void;

/**
 * Configuration for rendering {@link DocumentationNode}s to `Markdown`, specified by {@link DocumentationNode."type"}.
 *
 * @remarks
 *
 * Note: in order to be complete, this *must* include an entry for all types enumerated under {@link DocumentationNodeType}.
 *
 * We supply a suite of default renderers for all of these.
 *
 * @public
 */
export interface MarkdownRenderers {
	/**
	 * Maps from a {@link DocumentationNode}'s {@link DocumentationNode."type"} to a renderer implementation for that kind of node.
	 */
	[documentationNodeKind: string]: RenderDocumentationNode;
}

/**
 * Default Markdown rendering configuration.
 */
const defaultMarkdownRenderers: MarkdownRenderers = {
	[DocumentationNodeType.Alert]: (node, writer, context): void =>
		renderAlert(node as AlertNode, writer, context),
	[DocumentationNodeType.BlockQuote]: (node, writer, context): void =>
		renderBlockQuote(node as BlockQuoteNode, writer, context),
	[DocumentationNodeType.CodeSpan]: (node, writer, context): void =>
		renderCodeSpan(node as CodeSpanNode, writer, context),
	[DocumentationNodeType.FencedCode]: (node, writer, context): void =>
		renderFencedCodeBlock(node as FencedCodeBlockNode, writer, context),
	[DocumentationNodeType.Heading]: (node, writer, context): void =>
		renderHeading(node as HeadingNode, writer, context),
	[DocumentationNodeType.LineBreak]: (node, writer, context): void =>
		renderLineBreak(node as LineBreakNode, writer, context),
	[DocumentationNodeType.Link]: (node, writer, context): void =>
		renderLink(node as LinkNode, writer, context),
	[DocumentationNodeType.Section]: (node, writer, context): void =>
		renderHierarchicalSection(node as SectionNode, writer, context),
	[DocumentationNodeType.HorizontalRule]: (node, writer, context): void =>
		renderHorizontalRule(node as HorizontalRuleNode, writer, context),
	[DocumentationNodeType.OrderedList]: (node, writer, context): void =>
		renderOrderedList(node as OrderedListNode, writer, context),
	[DocumentationNodeType.Paragraph]: (node, writer, context): void =>
		renderParagraph(node as ParagraphNode, writer, context),
	[DocumentationNodeType.PlainText]: (node, writer, context): void =>
		renderPlainText(node as PlainTextNode, writer, context),
	[DocumentationNodeType.Span]: (node, writer, context): void =>
		renderSpan(node as SpanNode, writer, context),
	[DocumentationNodeType.Table]: (node, writer, context): void =>
		renderTable(node as TableNode, writer, context),
	[DocumentationNodeType.TableCell]: (node, writer, context): void =>
		renderTableCell(node as TableCellNode, writer, context),
	[DocumentationNodeType.TableRow]: (node, writer, context): void =>
		renderTableRow(node as TableRowNode, writer, context),
	[DocumentationNodeType.UnorderedList]: (node, writer, context): void =>
		renderUnorderedList(node as UnorderedListNode, writer, context),
};

/**
 * Constructs a complete list of {@link MarkdownRenderers} using provided optional renderer overrides, and filling
 * in the rest with system defaults.
 *
 * @public
 */
export function getRenderersWithDefaults(customRenderers?: MarkdownRenderers): MarkdownRenderers {
	return {
		...defaultMarkdownRenderers,
		...customRenderers,
	};
}
