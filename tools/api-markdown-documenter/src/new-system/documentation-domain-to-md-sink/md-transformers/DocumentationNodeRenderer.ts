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
import { LinkToMarkdown } from "./LinkToMd";
import { OrderedListToMarkdown } from "./OrderedListToMd";
import { ParagraphToMarkdown } from "./ParagraphToMd";
import { PlainTextToMarkdown } from "./PlainTextToMd";
import { SpanToMarkdown } from "./SpanToMd";
import { TableCellToMarkdown } from "./TableCellToMd";
import { TableRowToMarkdown } from "./TableRowToMd";
import { TableToMarkdown } from "./TableToMd";
import { UnorderedListToMarkdown } from "./UnorderedListToMd";
import { addNewlineOrBlank, standardEOL } from "./Utilities";

export type DocumentationNodeRenderFunction = (
    node: DocumentationNode,
    renderer: DocumentationNodeRenderer,
) => string;

// TODO: better name?
export type NodeRenderers = {
    [DocumentationNodeType.Alert]: (
        node: AlertNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => string;
    [DocumentationNodeType.BlockQuote]: (
        node: BlockQuoteNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => string;
    [DocumentationNodeType.CodeSpan]: (
        node: CodeSpanNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => string;
    [DocumentationNodeType.FencedCode]: (
        node: FencedCodeBlockNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => string;
    [DocumentationNodeType.Heading]: (
        node: HeadingNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => string;
    [DocumentationNodeType.LineBreak]: (
        node: LineBreakNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => string;
    [DocumentationNodeType.Link]: (
        node: LinkNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => string;
    [DocumentationNodeType.HierarchicalSection]: (
        node: HierarchicalSectionNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => string;
    [DocumentationNodeType.OrderedList]: (
        node: OrderedListNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => string;
    [DocumentationNodeType.Paragraph]: (
        node: ParagraphNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => string;
    [DocumentationNodeType.PlainText]: (
        node: PlainTextNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => string;
    [DocumentationNodeType.Span]: (
        node: SpanNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => string;
    [DocumentationNodeType.Table]: (
        node: TableNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => string;
    [DocumentationNodeType.TableCell]: (
        node: TableCellNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => string;
    [DocumentationNodeType.TableRow]: (
        node: TableRowNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => string;
    [DocumentationNodeType.UnorderedList]: (
        node: UnorderedListNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => string;
};

export class DefaultNodeRenderers {
    [DocumentationNodeType.Alert] = AlertToMarkdown;
    [DocumentationNodeType.BlockQuote] = BlockQuoteToMarkdown;
    [DocumentationNodeType.CodeSpan] = CodeSpanToMarkdown;
    [DocumentationNodeType.FencedCode] = FencedCodeBlockToMarkdown;
    [DocumentationNodeType.Heading] = HeadingToMarkdown;
    [DocumentationNodeType.LineBreak] = (
        node: LineBreakNode,
        subtreeRenderer: DocumentationNodeRenderer,
    ) => (subtreeRenderer.isInsideCodeBlock ? `<br/>` : standardEOL);
    [DocumentationNodeType.Link] = LinkToMarkdown;
    [DocumentationNodeType.HierarchicalSection] = HierarchicalSectionToMarkdown;
    [DocumentationNodeType.OrderedList] = OrderedListToMarkdown;
    [DocumentationNodeType.Paragraph] = ParagraphToMarkdown;
    [DocumentationNodeType.PlainText] = PlainTextToMarkdown;
    [DocumentationNodeType.Span] = SpanToMarkdown;
    [DocumentationNodeType.Table] = TableToMarkdown;
    [DocumentationNodeType.TableCell] = TableCellToMarkdown;
    [DocumentationNodeType.TableRow] = TableRowToMarkdown;
    [DocumentationNodeType.UnorderedList] = UnorderedListToMarkdown;
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
        let renderedNode = `TODO: UNKNOWN NODE (${node.type}) ENCOUNTERED`;
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

    if (node.frontMatter) {
        output.push(`${node.frontMatter}${standardEOL}`);
    }
    if (node.title) {
        output.push(`# ${node.title}${standardEOL}${standardEOL}`);
    }
    if (node.header) {
        output.push(
            `${renderer.renderNode(node.header)}${addNewlineOrBlank(
                renderer.getLastRenderedCharacter(),
            )}${standardEOL}`,
        );
    }

    output.push(...node.children.map((child) => renderer.renderNode(child)));

    if (node.footer) {
        output.push(
            `${addNewlineOrBlank(
                renderer.getLastRenderedCharacter(),
            )}${standardEOL}${renderer.renderNode(node.footer)}${addNewlineOrBlank(
                renderer.getLastRenderedCharacter(),
            )}${standardEOL}`,
        );
    }

    return output.join("");
}
