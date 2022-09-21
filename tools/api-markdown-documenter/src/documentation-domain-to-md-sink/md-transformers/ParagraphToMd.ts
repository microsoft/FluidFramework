import * as os from "os";

import { ParagraphNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";

export function ParagraphToMarkdown(
    paragraph: ParagraphNode,
    renderer: DocumentationNodeRenderer,
): string {
    const output: string[] = paragraph.children
        ? paragraph.children.map((child) => renderer.renderNode(child))
        : [];
    output.push(`  ${os.EOL}`);
    return output.join("");
}
