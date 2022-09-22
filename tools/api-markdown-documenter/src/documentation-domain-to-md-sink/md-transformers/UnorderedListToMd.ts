import { UnorderedListNode } from "../../documentation-domain";
import { standardEOL } from "./Utilities";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";

export function UnorderedListToMarkdown(
    listNode: UnorderedListNode,
    renderer: DocumentationNodeRenderer,
): string {
    return listNode.children.map(child => `- ${renderer.renderNode(child)}`).join(standardEOL);
}
