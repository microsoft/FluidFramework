import { LinkNode } from "../../documentation-domain";
import { getEscapedText } from "./Utilities";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";

export function LinkToMarkdown(linkNode: LinkNode, renderer: DocumentationNodeRenderer): string {
    const linkText = getEscapedText(renderer.renderNodes(linkNode.children).replace(/\s+/g, ' '));
    return `[${linkText}](${linkNode.target})`;
}
