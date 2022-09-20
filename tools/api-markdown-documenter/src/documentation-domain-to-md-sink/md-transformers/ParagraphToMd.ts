import { DocumentationNode, ParagraphNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";
import * as os from 'os';

export function ParagraphNodeToMarkdown(
    node: DocumentationNode,
    renderer: DocumentationNodeRenderer,
): string {
    const paragraph = node as unknown as ParagraphNode;
    const output: string[] = paragraph.children
        ? paragraph.children.map((child) => renderer.RenderNode(child))
        : [];
    output.push(os.EOL);
    return output.join('');
}
