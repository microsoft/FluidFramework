import { TableCellNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";

/**
 * Recursively enumerates an TableCellNode to generate a markdown fenced code block.
 *
 * @param tableCellNode - TableCellNode to convert into markdown
 * @param renderer - Renderer to recursively render child subtrees
 * @returns The markdown representation of the TableCellNode as a string
 */
export function TableCellToMarkdown(
    tableCellNode: TableCellNode,
    renderer: DocumentationNodeRenderer,
): string {
    renderer.setInsideTable();
    return renderer.renderNodes(tableCellNode.children);
}
