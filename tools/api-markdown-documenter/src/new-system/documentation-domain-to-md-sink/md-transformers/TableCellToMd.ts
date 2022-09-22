import { TableCellNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";

export function TableCellToMarkdown(
    tableCellNode: TableCellNode,
    renderer: DocumentationNodeRenderer,
): string {
    renderer.setInsideTable();
    return renderer.renderNodes(tableCellNode.children);
}
