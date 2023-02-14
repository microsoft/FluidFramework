import {
	AlertNode,
	BlockQuoteNode,
	CodeSpanNode,
	DocumentNode,
	DocumentationNode,
	DocumentationNodeType,
	FencedCodeBlockNode,
	HeadingNode,
	HierarchicalSectionNode,
	LineBreakNode,
	LinkNode,
	OrderedListNode,
	ParagraphNode,
	PlainTextNode,
	SpanNode,
	TableCellNode,
	TableNode,
	TableRowNode,
	UnorderedListNode,
} from "../../documentation-domain";
import { AlertToMarkdown } from "./AlertToMd";
import { BlockQuoteToMarkdown } from "./BlockQuoteToMd";
import { CodeSpanToMarkdown } from "./CodeSpanToMd";
import { FencedCodeBlockToMarkdown } from "./FencedCodeToMd";
import { HeadingToMarkdown } from "./HeadingToMd";
import { HierarchicalSectionToMarkdown } from "./HierarchicalSectionToMd";
import { LineBreakToMarkdown } from "./LineBreakToMd";
import { LinkToMarkdown } from "./LinkToMd";
import { OrderedListToMarkdown } from "./OrderedListToMd";
import { ParagraphToMarkdown } from "./ParagraphToMd";
import { PlainTextToMarkdown } from "./PlainTextToMd";
import { SpanToMarkdown } from "./SpanToMd";
import { TableCellToMarkdown } from "./TableCellToMd";
import { TableRowToMarkdown } from "./TableRowToMd";
import { TableToMarkdown } from "./TableToMd";
import { UnorderedListToMarkdown } from "./UnorderedListToMd";
import { addNewlineOrBlank, countTrailingNewlines, standardEOL } from "./Utilities";

/**
 * {@link DocumentationNode} renderer type-signature.
 */
export type DocumentationNodeRenderSignature<
	TDocumentationNode extends DocumentationNode = DocumentationNode,
> = (node: TDocumentationNode, subtreeRenderer: DocumentationNodeRenderer) => string;

/**
 * All known node types this renderer supports by default
 */
export interface DocumentationNodeRenderers {
	/**
	 * Maps from a {@link DocumentationNode}'s {@link DocumentationNode."type"} to a renderer implementation for that kind of node.
	 */
	[documentationNodeKind: string]: DocumentationNodeRenderSignature;
}

/**
 * Simple class which provides default rendering implementations for nodes
 */
export const defaultNodeRenderers: DocumentationNodeRenderers = {
	[DocumentationNodeType.Alert]: (node, subtreeRenderer): string =>
		AlertToMarkdown(node as AlertNode, subtreeRenderer),
	[DocumentationNodeType.BlockQuote]: (node, subtreeRenderer): string =>
		BlockQuoteToMarkdown(node as BlockQuoteNode, subtreeRenderer),
	[DocumentationNodeType.CodeSpan]: (node, subtreeRenderer): string =>
		CodeSpanToMarkdown(node as CodeSpanNode, subtreeRenderer),
	[DocumentationNodeType.FencedCode]: (node, subtreeRenderer): string =>
		FencedCodeBlockToMarkdown(node as FencedCodeBlockNode, subtreeRenderer),
	[DocumentationNodeType.Heading]: (node, subtreeRenderer): string =>
		HeadingToMarkdown(node as HeadingNode, subtreeRenderer),
	[DocumentationNodeType.LineBreak]: (node, subtreeRenderer): string =>
		LineBreakToMarkdown(node as LineBreakNode, subtreeRenderer),
	[DocumentationNodeType.Link]: (node, subtreeRenderer): string =>
		LinkToMarkdown(node as LinkNode, subtreeRenderer),
	[DocumentationNodeType.HierarchicalSection]: (node, subtreeRenderer): string =>
		HierarchicalSectionToMarkdown(node as HierarchicalSectionNode, subtreeRenderer),
	[DocumentationNodeType.OrderedList]: (node, subtreeRenderer): string =>
		OrderedListToMarkdown(node as OrderedListNode, subtreeRenderer),
	[DocumentationNodeType.Paragraph]: (node, subtreeRenderer): string =>
		ParagraphToMarkdown(node as ParagraphNode, subtreeRenderer),
	[DocumentationNodeType.PlainText]: (node, subtreeRenderer): string =>
		PlainTextToMarkdown(node as PlainTextNode, subtreeRenderer),
	[DocumentationNodeType.Span]: (node, subtreeRenderer): string =>
		SpanToMarkdown(node as SpanNode, subtreeRenderer),
	[DocumentationNodeType.Table]: (node, subtreeRenderer): string =>
		TableToMarkdown(node as TableNode, subtreeRenderer),
	[DocumentationNodeType.TableCell]: (node, subtreeRenderer): string =>
		TableCellToMarkdown(node as TableCellNode, subtreeRenderer),
	[DocumentationNodeType.TableRow]: (node, subtreeRenderer): string =>
		TableRowToMarkdown(node as TableRowNode, subtreeRenderer),
	[DocumentationNodeType.UnorderedList]: (node, subtreeRenderer): string =>
		UnorderedListToMarkdown(node as UnorderedListNode, subtreeRenderer),
};

/**
 * Class for recursively rendering node trees and maintaining state (style, hierarchy depth, count of trailing newlines) while rendering nodes.
 * Generally doesn't need to be instantiated directly. Use markdownFromDocumentNode to generate markdown from a document node instead of creating this directly.
 */
export class DocumentationNodeRenderer {
	private trailingNewlinesCount = 1; // Start the document at 1 so elements don't unnecessarily prepend newlines
	private readonly renderers: DocumentationNodeRenderers;
	private renderingContext = {
		bold: false,
		strikethrough: false,
		italic: false,
		insideTable: false,
		insideCodeBlock: false,
		depth: 0,
	};

	/**
	 * Creates a new helper object for rendering node subtrees
	 *
	 * @param customRenderers - Custom renderers to override default implementations.
	 * @remarks The custom renderers object can also include custom node types that this renderer isn't explicitly aware of. Provide a key/value pair where the key is the node type as a string, and the value is a
	 * callback function. If the renderer encounters a custom node type, it will invoke the provided custom function.
	 */
	public constructor(customRenderers?: DocumentationNodeRenderers) {
		this.renderers = {
			...defaultNodeRenderers,
			...customRenderers,
		};
	}

	/**
	 * Renders a given a node into markdown.
	 *
	 * @param node - Node to render
	 * @returns A markdown version of the given node
	 */
	public renderNode(node: DocumentationNode): string {
		const prevRenderingContext = this.renderingContext;
		const newRenderingContext = { ...prevRenderingContext };
		this.renderingContext = newRenderingContext;

		let renderedNode: string | undefined;
		switch (node.type) {
			case DocumentationNodeType.Alert:
				renderedNode = this.renderers[DocumentationNodeType.Alert](
					node as unknown as AlertNode,
					this,
				);
				break;
			case DocumentationNodeType.BlockQuote:
				renderedNode = this.renderers[DocumentationNodeType.BlockQuote](
					node as unknown as BlockQuoteNode,
					this,
				);
				break;
			case DocumentationNodeType.CodeSpan:
				renderedNode = this.renderers[DocumentationNodeType.CodeSpan](
					node as unknown as CodeSpanNode,
					this,
				);
				break;
			case DocumentationNodeType.FencedCode:
				renderedNode = this.renderers[DocumentationNodeType.FencedCode](
					node as unknown as FencedCodeBlockNode,
					this,
				);
				break;
			case DocumentationNodeType.Heading:
				renderedNode = this.renderers[DocumentationNodeType.Heading](
					node as unknown as HeadingNode,
					this,
				);
				break;
			case DocumentationNodeType.HierarchicalSection:
				renderedNode = this.renderers[DocumentationNodeType.HierarchicalSection](
					node as unknown as HierarchicalSectionNode,
					this,
				);
				break;
			case DocumentationNodeType.LineBreak:
				renderedNode = this.renderers[DocumentationNodeType.LineBreak](
					node as unknown as LineBreakNode,
					this,
				);
				break;
			case DocumentationNodeType.Link:
				renderedNode = this.renderers[DocumentationNodeType.Link](node as LinkNode, this);
				break;
			case DocumentationNodeType.OrderedList:
				renderedNode = this.renderers[DocumentationNodeType.OrderedList](
					node as unknown as OrderedListNode,
					this,
				);
				break;
			case DocumentationNodeType.Paragraph:
				renderedNode = this.renderers[DocumentationNodeType.Paragraph](
					node as unknown as ParagraphNode,
					this,
				);
				break;
			case DocumentationNodeType.PlainText:
				renderedNode = this.renderers[DocumentationNodeType.PlainText](
					node as unknown as PlainTextNode,
					this,
				);
				break;
			case DocumentationNodeType.Span:
				renderedNode = this.renderers[DocumentationNodeType.Span](
					node as unknown as SpanNode,
					this,
				);
				break;
			case DocumentationNodeType.Table:
				renderedNode = this.renderers[DocumentationNodeType.Table](
					node as unknown as TableNode,
					this,
				);
				break;
			case DocumentationNodeType.TableRow:
				renderedNode = this.renderers[DocumentationNodeType.TableRow](
					node as unknown as TableRowNode,
					this,
				);
				break;
			case DocumentationNodeType.TableCell:
				renderedNode = this.renderers[DocumentationNodeType.TableCell](
					node as unknown as TableCellNode,
					this,
				);
				break;
			case DocumentationNodeType.UnorderedList:
				renderedNode = this.renderers[DocumentationNodeType.UnorderedList](
					node as unknown as UnorderedListNode,
					this,
				);
				break;
			default:
				// eslint-disable-next-line no-case-declarations
				const rendererForNode = this.renderers[node.type] as unknown;
				if (rendererForNode !== undefined && typeof rendererForNode === "function") {
					// We don't recognize this node type, but a renderer was given to us (probably from custom renderers). We'll invoke it and hope for the best
					renderedNode = rendererForNode(node, this) as string;
				} else {
					throw new Error(
						`Encountered an unrecognized DocumentationNode type: ${node.type}. Please provide a renderer for this type.`,
					);
				}
				break;
		}
		this.renderingContext = prevRenderingContext;
		this.trailingNewlinesCount =
			renderedNode.length > 0
				? countTrailingNewlines(renderedNode)
				: this.trailingNewlinesCount;
		return renderedNode;
	}

	/**
	 * Helper function - iterates through all given nodes and invokes renderNode() on each of them
	 *
	 * @param nodes - Nodes to render
	 * @returns A single string, which is the combined output of every node's renderNode() call
	 */
	public renderNodes(nodes: DocumentationNode[]): string {
		return nodes.map((node) => this.renderNode(node)).join("");
	}

	/**
	 * Sets the bold style flag for all content beneath the current node.
	 */
	public setBold(): void {
		this.renderingContext.bold = true;
	}

	/**
	 * Sets the italic style flag for all content beneath the current node.
	 */
	public setItalic(): void {
		this.renderingContext.italic = true;
	}

	/**
	 * Sets the strikethrough style flag for all content beneath the current node.
	 */
	public setStrikethrough(): void {
		this.renderingContext.strikethrough = true;
	}

	/**
	 * Flags the content beneath the current node as being nested inside of a table.
	 */
	public setInsideTable(): void {
		this.renderingContext.insideTable = true;
	}

	/**
	 * Flags the content beneath the current node as being nested inside of a code block.
	 */
	public setInsideCodeBlock(): void {
		this.renderingContext.insideCodeBlock = true;
	}

	/**
	 * Increases the hierarchical depth for all children of the current node (used for headings)
	 */
	public increaseHierarchicalDepth(): void {
		this.renderingContext.depth++;
	}

	/**
	 * True if the subtree should apply bold styles to rendered content
	 */
	public get applyingBold(): boolean {
		return this.renderingContext.bold;
	}

	/**
	 * True if the subtree should apply italic styles to rendered content
	 */
	public get applyingItalic(): boolean {
		return this.renderingContext.italic;
	}

	/**
	 * True if the subtree should apply strikethrough styles to rendered content
	 */
	public get applyingStrikethrough(): boolean {
		return this.renderingContext.strikethrough;
	}

	/**
	 * True if the current node is being rendered inside of a table
	 */
	public get isInsideTable(): boolean {
		return this.renderingContext.insideTable;
	}

	/**
	 * True if the current node is being rendered inside of a code block
	 */
	public get isInsideCodeBlock(): boolean {
		return this.renderingContext.insideCodeBlock;
	}

	/**
	 * Returns how deep into nested HierarchicalSectionNodes the renderer currently is
	 */
	public get hierarchyDepth(): number {
		return this.renderingContext.depth;
	}

	/**
	 * Returns the number of trailing newlines in the last element this renderer rendered.
	 */
	public get countTrailingNewlines(): number {
		return this.trailingNewlinesCount;
	}

	/**
	 * Determines whether additional newlines are required to ensure new content is preceeded by the
	 * specified number of newlines.
	 *
	 * @param requiredBlankLineCount - The number of required preceeding blank lines.
	 *
	 * @returns If newlines are required, this will return a string containing those required
	 * newline characters.
	 * Otherwise, will return an empty string.
	 */
	public ensurePreceedingBlankLines(requiredBlankLineCount: number): string {
		const preceedingBlankLines = this.countTrailingNewlines - 1;
		if (preceedingBlankLines > requiredBlankLineCount) {
			return "";
		}
		return standardEOL.repeat(requiredBlankLineCount - preceedingBlankLines + 1);
	}
}

/**
 * Generates markdown for a DocumentNode
 *
 * @param node - Node to convert into narkdown
 * @param customRenderers - Optional custom node renderers
 */
export function markdownFromDocumentNode(
	node: DocumentNode,
	customRenderers?: DocumentationNodeRenderers,
): string {
	// TODO: configurability of individual node renderers
	const renderer = new DocumentationNodeRenderer(customRenderers);
	const output: string[] = [];

	if (node.frontMatter !== undefined) {
		output.push(`${node.frontMatter}${standardEOL}`);
	}
	if (node.title !== undefined) {
		output.push(`# ${node.title}${standardEOL}${standardEOL}`);
		renderer.increaseHierarchicalDepth();
	}
	if (node.header) {
		output.push(
			`${renderer.renderNode(node.header)}${addNewlineOrBlank(
				renderer.countTrailingNewlines < 2,
			)}${standardEOL}`,
		);
	}

	output.push(...node.children.map((child) => renderer.renderNode(child)));
	output.push(addNewlineOrBlank(renderer.countTrailingNewlines < 2));

	if (node.footer) {
		output.push(
			`${standardEOL}${renderer.renderNode(node.footer)}${addNewlineOrBlank(
				renderer.countTrailingNewlines < 2,
			)}${standardEOL}`,
		);
	}

	return output.join("");
}
