import {
    AlertNode,
    BlockQuoteNode,
    CodeSpanNode,
    DocumentNode,
    DocumentNodeType,
    DocumentationNode,
    FencedCodeBlockNode,
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
import { HierarchicalSectionToMarkdown } from "./HierarchicalSectionToMd";
import { LinkToMarkdown } from "./LinkToMd";
import { OrderedListToMarkdown } from "./OrderedListToMd";
import { ParagraphToMarkdown } from "./ParagraphToMd";
import { PlainTextToMarkdown } from "./PlainTextToMd";
import { SpanToMarkdown } from "./SpanToMd";
import { TableCellToMarkdown } from "./TableCellToMd";
import { TableRowToMarkdown } from "./TableRowToMd";
import { TableToMarkdown } from "./TableToMd";
import { UnorderedListToMarkdown } from "./UnorderedListToMd";
import { standardEOL } from "./Utilities";

export type DocumentationNodeRenderFunction = (
    node: DocumentationNode,
    renderer: DocumentationNodeRenderer,
) => string;

// TODO: better name?
export type NodeRenderers = {
    [DocumentNodeType.Alert]: (
        node: AlertNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => string;
    [DocumentNodeType.BlockQuote]: (
        node: BlockQuoteNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => string;
    [DocumentNodeType.CodeSpan]: (
        node: CodeSpanNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => string;
    [DocumentNodeType.FencedCode]: (
        node: FencedCodeBlockNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => string;
    [DocumentNodeType.LineBreak]: (
        node: LineBreakNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => string;
    [DocumentNodeType.HierarchicalSection]: (
        node: HierarchicalSectionNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => string;
    [DocumentNodeType.OrderedList]: (
        node: OrderedListNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => string;
    [DocumentNodeType.Paragraph]: (
        node: ParagraphNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => string;
    [DocumentNodeType.PlainText]: (
        node: PlainTextNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => string;
    [DocumentNodeType.Span]: (node: SpanNode, subtreeRenderer: DocumentationNodeRenderer) => string;
    [DocumentNodeType.SymbolicLink]: (
        // TODO: Valid?
        node: DocumentationNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => string;
    [DocumentNodeType.Table]: (
        node: TableNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => string;
    [DocumentNodeType.TableCell]: (
        node: TableCellNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => string;
    [DocumentNodeType.TableRow]: (
        node: TableRowNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => string;
    [DocumentNodeType.UnorderedList]: (
        node: UnorderedListNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => string;
    [DocumentNodeType.UrlLink]: (
        node: LinkNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => string;
};

export class DefaultNodeRenderers {
    [DocumentNodeType.Alert] = AlertToMarkdown;
    [DocumentNodeType.BlockQuote] = BlockQuoteToMarkdown;
    [DocumentNodeType.CodeSpan] = CodeSpanToMarkdown;
    [DocumentNodeType.FencedCode] = FencedCodeBlockToMarkdown;
    [DocumentNodeType.LineBreak] = (
        node: LineBreakNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => (subtreeRenderer.isInsideCodeBlock ? standardEOL : `<br/>`);
    [DocumentNodeType.HierarchicalSection] = HierarchicalSectionToMarkdown;
    [DocumentNodeType.OrderedList] = OrderedListToMarkdown;
    [DocumentNodeType.Paragraph] = ParagraphToMarkdown;
    [DocumentNodeType.PlainText] = PlainTextToMarkdown;
    [DocumentNodeType.Span] = SpanToMarkdown;
    [DocumentNodeType.SymbolicLink] = (
        node: DocumentationNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => "TODO: Are symbolic links valid?";
    [DocumentNodeType.Table] = TableToMarkdown;
    [DocumentNodeType.TableCell] = TableCellToMarkdown;
    [DocumentNodeType.TableRow] = TableRowToMarkdown;
    [DocumentNodeType.UnorderedList] = UnorderedListToMarkdown;
    [DocumentNodeType.UrlLink] = LinkToMarkdown;
}

export interface RenderingContext {
    bold: boolean;
    italic: boolean;
    strikethrough: boolean;
    insideTable: boolean;
    insideCodeBlock: boolean;
    depth: number;
}

export const DefaultRenderers = new DefaultNodeRenderers();
export class DocumentationNodeRenderer {
    private lastRenderedCharacter = "";
    private renderers: NodeRenderers = DefaultRenderers;
    private renderingContext: RenderingContext = {
        bold: false,
        strikethrough: false,
        italic: false,
        insideTable: false,
        insideCodeBlock: false,
        depth: 0,
    };
    public renderNode(node: DocumentationNode): string {
        const prevRenderingContext = this.renderingContext;
        const newRenderingContext = { ...prevRenderingContext };
        this.renderingContext = newRenderingContext;
        let renderedNode = "TODO: UNKNOWN NODE ENCOUNTERED";
        switch (node.type) {
            case DocumentNodeType.Alert:
                renderedNode = this.renderers[DocumentNodeType.Alert](
                    node as unknown as AlertNode,
                    this,
                );
                break;
            case DocumentNodeType.BlockQuote:
                renderedNode = this.renderers[DocumentNodeType.BlockQuote](
                    node as unknown as BlockQuoteNode,
                    this,
                );
                break;
            case DocumentNodeType.CodeSpan:
                renderedNode = this.renderers[DocumentNodeType.CodeSpan](
                    node as unknown as CodeSpanNode,
                    this,
                );
                break;
            case DocumentNodeType.FencedCode:
                renderedNode = this.renderers[DocumentNodeType.FencedCode](
                    node as unknown as FencedCodeBlockNode,
                    this,
                );
                break;
            case DocumentNodeType.HierarchicalSection:
                renderedNode = this.renderers[DocumentNodeType.HierarchicalSection](
                    node as unknown as HierarchicalSectionNode,
                    this,
                );
                break;
            case DocumentNodeType.LineBreak:
                renderedNode = this.renderers[DocumentNodeType.Paragraph](
                    node as unknown as ParagraphNode,
                    this,
                );
                break;
            case DocumentNodeType.OrderedList:
                renderedNode = this.renderers[DocumentNodeType.OrderedList](
                    node as unknown as OrderedListNode,
                    this,
                );
                break;
            case DocumentNodeType.Paragraph:
                renderedNode = this.renderers[DocumentNodeType.Paragraph](
                    node as unknown as ParagraphNode,
                    this,
                );
                break;
            case DocumentNodeType.PlainText:
                renderedNode = this.renderers[DocumentNodeType.PlainText](
                    node as unknown as PlainTextNode,
                    this,
                );
                break;
            case DocumentNodeType.Span:
                renderedNode = this.renderers[DocumentNodeType.Span](
                    node as unknown as SpanNode,
                    this,
                );
                break;
            case DocumentNodeType.SymbolicLink:
                renderedNode = this.renderers[DocumentNodeType.SymbolicLink](node, this);
                break;
            case DocumentNodeType.Table:
                renderedNode = this.renderers[DocumentNodeType.Table](
                    node as unknown as TableNode,
                    this,
                );
                break;
            case DocumentNodeType.TableRow:
                renderedNode = this.renderers[DocumentNodeType.TableRow](
                    node as unknown as TableRowNode,
                    this,
                );
                break;
            case DocumentNodeType.TableCell:
                renderedNode = this.renderers[DocumentNodeType.TableCell](
                    node as unknown as TableCellNode,
                    this,
                );
                break;
            case DocumentNodeType.UnorderedList:
                renderedNode = this.renderers[DocumentNodeType.UnorderedList](
                    node as unknown as UnorderedListNode,
                    this,
                );
                break;
            case DocumentNodeType.UrlLink:
                renderedNode = this.renderers[DocumentNodeType.UrlLink](
                    node as unknown as LinkNode,
                    this,
                );
                break;
        }
        this.renderingContext = prevRenderingContext;
        this.lastRenderedCharacter = renderedNode.length
            ? renderedNode[renderedNode.length - 1]
            : "";
        return renderedNode;
    }

    public renderNodes(nodes: DocumentationNode[]): string {
        return nodes.map((node) => this.renderNode(node)).join("");
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
    public setInsideTable(): void {
        this.renderingContext.insideTable = true;
    }
    public setInsideCodeBlock(): void {
        this.renderingContext.insideCodeBlock = true;
    }
    public increaseHierarchicalDepth(): void {
        this.renderingContext.depth++;
    }

    public get applyingBold() {
        return this.renderingContext.bold;
    }
    public get applyingItalic() {
        return this.renderingContext.italic;
    }
    public get applyingStrikethrough() {
        return this.renderingContext.strikethrough;
    }
    public get isInsideTable() {
        return this.renderingContext.insideTable;
    }
    public get isInsideCodeBlock() {
        return this.renderingContext.insideCodeBlock;
    }
    public get hierarchyDepth() {
        return this.renderingContext.depth;
    }
    public getLastRenderedCharacter(): string {
        return this.lastRenderedCharacter;
    }
}

export function markdownFromDocumentNode(node: DocumentNode): string {
    // todo: configurability of individual node renderers
    const renderer = new DocumentationNodeRenderer();
    const output: string[] = [];
    if (node.title) {
        output.push(`# ${node.title}${standardEOL}${standardEOL}`);
    }
    output.push(...node.children.map((child) => renderer.renderNode(child)));
    return output.join("");
}
