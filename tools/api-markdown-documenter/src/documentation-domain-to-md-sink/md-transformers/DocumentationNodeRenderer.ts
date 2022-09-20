import { DocumentNodeType, DocumentationNode, DocumentNode } from "../../documentation-domain";
import { ParagraphNodeToMarkdown } from "./ParagraphToMd";

export type DocumentationNodeRenderFunction = (node: DocumentationNode, renderer: DocumentationNodeRenderer) => string;

// TODO: better name?
export type NodeRenderers = {
    [K in DocumentNodeType]: DocumentationNodeRenderFunction;
}

const noop = (node: DocumentationNode, renderer: DocumentationNodeRenderer) => '';

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
    [DocumentNodeType.PlainText] = noop;
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
    public RenderNode(node: DocumentationNode): string {
        return this.renderers[node.type](node, this);
    }
}

export function markdownFromDocumentNode(node: DocumentNode): string {
     // todo: configurability of individual node renderers
    const renderer = new DocumentationNodeRenderer();
    return node.children.map(child => renderer.RenderNode(child)).join();
}
