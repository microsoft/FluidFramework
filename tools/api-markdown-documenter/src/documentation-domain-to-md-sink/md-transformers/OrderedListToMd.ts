import { OrderedListNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";
import { standardEOL } from "./Utilities";

export function OrderedListToMarkdown(
    listNode: OrderedListNode,
    renderer: DocumentationNodeRenderer,
): string {
    return listNode.children
        .map((child, index) => `${index + 1}. ${renderer.renderNode(child)}`)
        .join(standardEOL);
}
