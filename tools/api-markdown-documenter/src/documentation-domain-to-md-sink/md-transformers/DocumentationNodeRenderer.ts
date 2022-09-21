import { DocumentNode, DocumentNodeType, DocumentationNode, PlainTextNode, ParagraphNode, SpanNode, LineBreakNode, AlertNode, BlockQuoteNode, CodeSpanNode, TableRowNode, FencedCodeBlockNode, MarkdownNode, HierarchicalSectionNode, OrderedListNode, LinkNode, TableNode, TableCellNode, UnorderedListNode } from "../../documentation-domain";
import { AlertToMarkdown } from "./AlertToMd";
import { BlockQuoteToMarkdown } from "./BlockQuoteToMd";
import { CodeSpanToMarkdown } from "./CodeSpanToMd";
import { FencedCodeBlockToMarkdown } from "./FencedCodeToMd";
import { HierarchicalSectionToMarkdown } from "./HierarchicalSectionToMd";
import { LinkToMarkdown } from "./LinkToMd";
import { OrderedListToMarkdown } from "./OrderedListToMd";
import { ParagraphToMarkdown } from "./ParagraphToMd";
import { PlainTextToMarkdown } from "./PlainTextToMd";
import { SpanToMarkdown } from './SpanToMd';
import { TableToMarkdown } from "./TableToMd";
import { TableCellToMarkdown } from "./TableCellToMd";
import { TableRowToMarkdown } from "./TableRowToMd";
import { UnorderedListToMarkdown } from "./UnorderedListToMd";

export type DocumentationNodeRenderFunction = (
    node: DocumentationNode,
    renderer: DocumentationNodeRenderer,
) => string;

// TODO: better name?
export type NodeRenderers = {
    [DocumentNodeType.Alert]: (node: AlertNode, subtreeRenderer: DocumentationNodeRenderer) => string;
    [DocumentNodeType.BlockQuote]: (node: BlockQuoteNode, subtreeRenderer: DocumentationNodeRenderer) => string;
    [DocumentNodeType.CodeSpan]: (node: CodeSpanNode, subtreeRenderer: DocumentationNodeRenderer) => string;
    [DocumentNodeType.FencedCode]: (node: FencedCodeBlockNode, subtreeRenderer: DocumentationNodeRenderer) => string;
    [DocumentNodeType.LineBreak]: (node: LineBreakNode) => string;
    [DocumentNodeType.Markdown]: (node: MarkdownNode, subtreeRenderer: DocumentationNodeRenderer) => string;
    [DocumentNodeType.HierarchicalSection]: (node: HierarchicalSectionNode, subtreeRenderer: DocumentationNodeRenderer) => string;
    [DocumentNodeType.OrderedList]: (node: OrderedListNode, subtreeRenderer: DocumentationNodeRenderer) => string;
    [DocumentNodeType.Paragraph]: (node: ParagraphNode, subtreeRenderer: DocumentationNodeRenderer) => string;
    [DocumentNodeType.PlainText]: (node: PlainTextNode, subtreeRenderer: DocumentationNodeRenderer) => string;
    [DocumentNodeType.Span]:  (node: SpanNode, subtreeRenderer: DocumentationNodeRenderer) => string;
    [DocumentNodeType.SymbolicLink]: (node: LinkNode, subtreeRenderer: DocumentationNodeRenderer) => string;
    [DocumentNodeType.Table]: (node: TableNode, subtreeRenderer: DocumentationNodeRenderer) => string;
    [DocumentNodeType.TableCell] : (node: TableCellNode, subtreeRenderer: DocumentationNodeRenderer) => string;
    [DocumentNodeType.TableRow] : (node: TableRowNode, subtreeRenderer: DocumentationNodeRenderer) => string;
    [DocumentNodeType.UnorderedList] : (node: UnorderedListNode, subtreeRenderer: DocumentationNodeRenderer) => string;
    [DocumentNodeType.UrlLink] : (node: LinkNode, subtreeRenderer: DocumentationNodeRenderer) => string;
};

class DefaultNodeRenderers {
    [DocumentNodeType.Alert] = AlertToMarkdown;
    [DocumentNodeType.BlockQuote] = BlockQuoteToMarkdown;
    [DocumentNodeType.CodeSpan] = CodeSpanToMarkdown;
    [DocumentNodeType.FencedCode] = FencedCodeBlockToMarkdown;
    [DocumentNodeType.LineBreak] = (node: LineBreakNode) => `</br>`;
    [DocumentNodeType.Markdown] = (node: MarkdownNode, subtreeRenderer: DocumentationNodeRenderer) => node.value as unknown as string;
    [DocumentNodeType.HierarchicalSection] = HierarchicalSectionToMarkdown;
    [DocumentNodeType.OrderedList] = OrderedListToMarkdown;
    [DocumentNodeType.Paragraph] = ParagraphToMarkdown;
    [DocumentNodeType.PlainText] = PlainTextToMarkdown;
    [DocumentNodeType.Span] = SpanToMarkdown;
    [DocumentNodeType.SymbolicLink] = LinkToMarkdown;
    [DocumentNodeType.Table] = TableToMarkdown;
    [DocumentNodeType.TableCell] = TableCellToMarkdown;
    [DocumentNodeType.TableRow] = TableRowToMarkdown;
    [DocumentNodeType.UnorderedList] = UnorderedListToMarkdown;
    [DocumentNodeType.UrlLink] = LinkToMarkdown;
}

export interface RenderingContext {
    bold: boolean,
    italic: boolean,
    strikethrough: boolean,
    insideHTML: boolean,
}

export const DefaultRenderers = new DefaultNodeRenderers();
export class DocumentationNodeRenderer {
    private renderers: NodeRenderers = DefaultRenderers;
    private renderingContext: RenderingContext = {
        bold: false,
        strikethrough: false,
        italic: false,
        insideHTML: false,
    }
    public renderNode(node: DocumentationNode): string {
        const prevRenderingContext = this.renderingContext;
        const newRenderingContext = {...prevRenderingContext};
        this.renderingContext = newRenderingContext;
        let renderedNode = 'TODO: UNKNOWN NODE ENCOUNTERED'
        switch (node.type) {
            case DocumentNodeType.Paragraph:
                renderedNode = this.renderers[DocumentNodeType.Paragraph](node as unknown as ParagraphNode, this);
                break;
            case DocumentNodeType.PlainText:
                renderedNode = this.renderers[DocumentNodeType.PlainText](node as unknown as PlainTextNode, this);
                break;
            case DocumentNodeType.Span:
                renderedNode = this.renderers[DocumentNodeType.Span](node as unknown as SpanNode, this);
                break;
        }
        this.renderingContext = prevRenderingContext;

        return renderedNode;
    }

    public setBold(): void {
        this.renderingContext.bold = true;
    }
    public setItalic(): void {
        this.renderingContext.italic = true;
    }
    public setStrikethrough(): void {
        this.renderingContext.strikethrough = true;
    }
    public setInsideHTML(): void {
        this.renderingContext.insideHTML = true;
    }

    public get applyingBold() { return this.renderingContext.bold };
    public get applyingItalic() { return this.renderingContext.italic };
    public get applyingStrikethrough() { return this.renderingContext.strikethrough };
    public get isInsideHTML() { return this.renderingContext.insideHTML };
}

export function markdownFromDocumentNode(node: DocumentNode): string {
    // todo: configurability of individual node renderers
    const renderer = new DocumentationNodeRenderer();
    return node.children.map((child) => renderer.renderNode(child)).join();
}
