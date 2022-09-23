import { TableRowNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";
import { standardEOL } from "./Utilities";

/**
 * Recursively enumerates an TableRowNode to generate a row of markdown elements.
 *
 * @param tableRowNode - TableRowNode to convert into markdown
 * @param renderer - Renderer to recursively render child subtrees
 * @returns The markdown representation of the TableRowNode as a string
 */
export function TableRowToMarkdown(
    tableRowNode: TableRowNode,
    renderer: DocumentationNodeRenderer,
): string {
    renderer.setInsideTable();

    const output = ["| "];
    for (const cell of tableRowNode.children) {
        output.push(" ");
        output.push(renderer.renderNodes(cell.children));
        output.push(" |");
    }

    return `${output.join("")}${standardEOL}`;
}
