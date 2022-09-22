import { OrderedListNode } from "../../documentation-domain";
import { standardEOL } from "./Utilities";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";

export function OrderedListToMarkdown(
    listNode: OrderedListNode,
    renderer: DocumentationNodeRenderer,
): string {
    return listNode.children.map((child, index) => `${index + 1}. ${renderer.renderNode(child)}`).join(standardEOL);
}
