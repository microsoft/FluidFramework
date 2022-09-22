import { BlockQuoteNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";
import { standardEOL } from "./Utilities";

export function BlockQuoteToMarkdown(
    blockQuoteNode: BlockQuoteNode,
    renderer: DocumentationNodeRenderer,
): string {
    return renderer
        .renderNodes(blockQuoteNode.children)
        .split(standardEOL) // Temporarily remove line breaks
        .map((line) => `>${line}`) // Prepend a block quote > in front of the line
        .join(standardEOL); // And return the line breaks
}
