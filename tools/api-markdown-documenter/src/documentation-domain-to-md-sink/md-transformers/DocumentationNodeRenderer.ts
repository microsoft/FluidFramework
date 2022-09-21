import { DocumentNode, DocumentNodeType, DocumentationNode, PlainTextNode, ParagraphNode, SpanNode, LineBreakNode } from "../../documentation-domain";
import { ParagraphNodeToMarkdown } from "./ParagraphToMd";
import { PlainTextToMarkdown } from "./PlainTextToMd";
import { SpanNodeToMarkdown } from './SpanToMd';
import * as os from 'os';

export type DocumentationNodeRenderFunction = (
    node: DocumentationNode,
    renderer: DocumentationNodeRenderer,
) => string;

// TODO: better name?
export type NodeRenderers = {
    [DocumentNodeType.Alert]: DocumentationNodeRenderFunction;
    [DocumentNodeType.BlockQuote]: DocumentationNodeRenderFunction;
    [DocumentNodeType.CodeSpan]: DocumentationNodeRenderFunction;
    [DocumentNodeType.Document]: DocumentationNodeRenderFunction;
    [DocumentNodeType.FencedCode]: DocumentationNodeRenderFunction;
    [DocumentNodeType.LineBreak]: (node: LineBreakNode) => string;
    [DocumentNodeType.Markdown]: DocumentationNodeRenderFunction;
    [DocumentNodeType.NestedSection]: DocumentationNodeRenderFunction;
    [DocumentNodeType.OrderedList]: DocumentationNodeRenderFunction;
    [DocumentNodeType.Paragraph]: (node: ParagraphNode, subtreeRenderer: DocumentationNodeRenderer) => string;
    [DocumentNodeType.PlainText]: (node: PlainTextNode, subtreeRenderer: DocumentationNodeRenderer) => string;
    [DocumentNodeType.Span]:  (node: SpanNode, subtreeRenderer: DocumentationNodeRenderer) => string;
    [DocumentNodeType.SymbolicLink]: DocumentationNodeRenderFunction;
    [DocumentNodeType.Table]: DocumentationNodeRenderFunction;
    [DocumentNodeType.TableCell] : DocumentationNodeRenderFunction;
    [DocumentNodeType.TableRow] : DocumentationNodeRenderFunction;
    [DocumentNodeType.UnorderedList] : DocumentationNodeRenderFunction;
    [DocumentNodeType.UrlLink] : DocumentationNodeRenderFunction;
};

const noop = (node: DocumentationNode, renderer: DocumentationNodeRenderer) => "??? noop called";

class DefaultNodeRenderers {
    [DocumentNodeType.Alert] = noop;
    [DocumentNodeType.BlockQuote] = noop;
    [DocumentNodeType.CodeSpan] = noop;
    [DocumentNodeType.Document] = noop; // There should never be any document nodes renders by RenderNode since there should never be a document under a document
    [DocumentNodeType.FencedCode] = noop;
    [DocumentNodeType.LineBreak] = (node: LineBreakNode) => `  ${os.EOL}`;
    [DocumentNodeType.Markdown] = noop;
    [DocumentNodeType.NestedSection] = noop;
    [DocumentNodeType.OrderedList] = noop;
    [DocumentNodeType.Paragraph] = ParagraphNodeToMarkdown;
    [DocumentNodeType.PlainText] = PlainTextToMarkdown;
    [DocumentNodeType.Span] = SpanNodeToMarkdown;
    [DocumentNodeType.SymbolicLink] = noop;
    [DocumentNodeType.Table] = noop;
    [DocumentNodeType.TableCell] = noop;
    [DocumentNodeType.TableRow] = noop;
    [DocumentNodeType.UnorderedList] = noop;
    [DocumentNodeType.UrlLink] = noop;
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
