import { LinkNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";
import { getEscapedText } from "./Utilities";

export function LinkToMarkdown(linkNode: LinkNode, renderer: DocumentationNodeRenderer): string {
    const linkText = getEscapedText(renderer.renderNodes(linkNode.children).replace(/\s+/g, " "));
    return `[${linkText}](${linkNode.target})`;
}
