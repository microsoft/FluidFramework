import { DocumentNode, DocumentNodeType, DocumentationNode, PlainTextNode, ParagraphNode } from "../../documentation-domain";
import { ParagraphNodeToMarkdown } from "./ParagraphToMd";
import { PlainTextToMarkdown } from "./PlainTextToMd";

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
    [DocumentNodeType.LineBreak]: DocumentationNodeRenderFunction;
    [DocumentNodeType.Markdown]: DocumentationNodeRenderFunction;
    [DocumentNodeType.NestedSection]: DocumentationNodeRenderFunction;
    [DocumentNodeType.OrderedList]: DocumentationNodeRenderFunction;
    [DocumentNodeType.Paragraph]: (node: ParagraphNode, subtreeRenderer: DocumentationNodeRenderer) => string;
    [DocumentNodeType.PlainText]: (node: PlainTextNode) => string;
    [DocumentNodeType.Span]: DocumentationNodeRenderFunction;
    [DocumentNodeType.SymbolicLink]: DocumentationNodeRenderFunction;
    [DocumentNodeType.Table]: DocumentationNodeRenderFunction;
    [DocumentNodeType.TableCell] : DocumentationNodeRenderFunction;
    [DocumentNodeType.TableRow] : DocumentationNodeRenderFunction;
    [DocumentNodeType.UnorderedList] : DocumentationNodeRenderFunction;
    [DocumentNodeType.UrlLink] : DocumentationNodeRenderFunction;
};

const noop = (node: DocumentationNode, renderer: DocumentationNodeRenderer) => "";

class DefaultNodeRenderers {
    [DocumentNodeType.Alert] = noop;
    [DocumentNodeType.BlockQuote] = noop;
    [DocumentNodeType.CodeSpan] = noop;
    [DocumentNodeType.Document] = noop; // There should never be any document nodes renders by RenderNode since there should never be a document under a document
    [DocumentNodeType.FencedCode] = noop;
    [DocumentNodeType.LineBreak] = noop;
    [DocumentNodeType.Markdown] = noop;
    [DocumentNodeType.NestedSection] = noop;
    [DocumentNodeType.OrderedList] = noop;
    [DocumentNodeType.Paragraph] = ParagraphNodeToMarkdown;
    [DocumentNodeType.PlainText] = PlainTextToMarkdown;
    [DocumentNodeType.Span] = noop;
    [DocumentNodeType.SymbolicLink] = noop;
    [DocumentNodeType.Table] = noop;
    [DocumentNodeType.TableCell] = noop;
    [DocumentNodeType.TableRow] = noop;
    [DocumentNodeType.UnorderedList] = noop;
    [DocumentNodeType.UrlLink] = noop;
}

export const DefaultRenderers = new DefaultNodeRenderers();
export class DocumentationNodeRenderer {
    private renderers: NodeRenderers = DefaultRenderers;
    public renderNode(node: DocumentationNode): string {
        switch (node.type) {
            case DocumentNodeType.Paragraph:
                return this.renderers[DocumentNodeType.Paragraph](node as unknown as ParagraphNode, this);
            case DocumentNodeType.PlainText:
                return this.renderers[DocumentNodeType.PlainText](node as unknown as PlainTextNode);
        }
        return 'TODO: UNKNOWN NODE ENCOUNTERED';
    }
}

export function markdownFromDocumentNode(node: DocumentNode): string {
    // todo: configurability of individual node renderers
    const renderer = new DocumentationNodeRenderer();
    return node.children.map((child) => renderer.renderNode(child)).join();
}
