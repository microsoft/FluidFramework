import { TableRowNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";
import { standardEOL } from "./Utilities";

export function TableRowToMarkdown(
    tableRowNode: TableRowNode,
    renderer: DocumentationNodeRenderer,
): string {
    renderer.setInsideTable();

    const output = ['| '];
    for (const cell of tableRowNode.children) {
        output.push(' ');
        output.push(renderer.renderNodes(cell.children));
        output.push(' |');
    }

    return `${output.join('')}${standardEOL}`;
}
