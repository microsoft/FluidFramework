import { DocumentationNode, ParagraphNode } from "../../documentation-domain";
import { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";

export function ParagraphNodeToMarkdown(node: DocumentationNode, renderer: DocumentationNodeRenderer): string {
    const paragraph = node as unknown as ParagraphNode;
    const output: string[] = paragraph.children ? paragraph.children.map(child => renderer.RenderNode(child)) : [];
    output.push('\r\n');
    return output.join();
}
