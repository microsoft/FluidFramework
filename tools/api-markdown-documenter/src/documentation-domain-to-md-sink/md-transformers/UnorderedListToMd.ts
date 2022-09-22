import { UnorderedListNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";
import { standardEOL } from "./Utilities";

export function UnorderedListToMarkdown(
    listNode: UnorderedListNode,
    renderer: DocumentationNodeRenderer,
): string {
    return listNode.children.map((child) => `- ${renderer.renderNode(child)}`).join(standardEOL);
}
