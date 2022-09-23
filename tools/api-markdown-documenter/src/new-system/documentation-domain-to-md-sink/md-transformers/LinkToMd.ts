import { LinkNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";
import { getEscapedText } from "./Utilities";

/**
 * Recursively enumerates an LinkNode to generate a link using markdown syntax.
 *
 * @param linkNode - LinkNode to convert into markdown
 * @param renderer - Renderer to recursively render child subtrees
 * @returns The markdown representation of the LinkNode as a string
 */
export function LinkToMarkdown(linkNode: LinkNode, renderer: DocumentationNodeRenderer): string {
    const linkText = getEscapedText(renderer.renderNodes(linkNode.children).replace(/\s+/g, " "));
    return `[${linkText}](${linkNode.target})`;
}
