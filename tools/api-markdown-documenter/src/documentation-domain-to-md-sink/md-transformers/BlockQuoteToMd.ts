import { BlockQuoteNode } from "../../documentation-domain";
import { standardEOL } from "./Utilities";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";

export function BlockQuoteToMarkdown(
    blockQuoteNode: BlockQuoteNode,
    renderer: DocumentationNodeRenderer,
): string {
    return renderer.renderNodes(blockQuoteNode.children)
        .split(standardEOL) // Temporarily remove line breaks
        .map(line => `>${line}`) // Prepend a block quote > in front of the line
        .join(standardEOL); // And return the line breaks
}
