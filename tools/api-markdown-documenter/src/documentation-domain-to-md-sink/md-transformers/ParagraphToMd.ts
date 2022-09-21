import { ParagraphNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";
import * as os from 'os';

export function ParagraphNodeToMarkdown(
    paragraph: ParagraphNode,
    renderer: DocumentationNodeRenderer,
): string {
    const output: string[] = paragraph.children
        ? paragraph.children.map((child) => renderer.renderNode(child))
        : [];
    output.push(`  ${os.EOL}`);
    return output.join('');
}
