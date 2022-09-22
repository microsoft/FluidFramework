import { TableNode } from "../../documentation-domain";
import { standardEOL } from "./Utilities";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";

function getTableMaxColumns(tableNode: TableNode): number {
    let max = 0;

    if (tableNode.headingRow) {
        max = tableNode.headingRow.children.length;
    }
    for (let row of tableNode.children) {
        max = Math.max(row.children.length, max);
    }
    return max;
}

export function TableToMarkdown(tableNode: TableNode, renderer: DocumentationNodeRenderer): string {
    renderer.setInsideTable();

    // GitHub's markdown renderer chokes on tables that don't have a blank line above them,
    // whereas VS Code's renderer is totally fine with it. We'll start with a newline
    const output = [standardEOL];

    const columnsCount = getTableMaxColumns(tableNode);

    // First, write the table header (which is required by Markdown)
    // Don't render the header via renderNode(), because this header row needs to be handled specially to add more columns to fit the max amount of columns we found in the table.
    // We'll render each header cell individually
    const headerRow = ['| ']
    for (let i = 0; i < columnsCount; ++i) {
        headerRow.push(' ');
        if (tableNode.headingRow && tableNode.headingRow.children.length < i) {
            headerRow.push(renderer.renderNode(tableNode.headingRow.children[i]));
        }
        headerRow.push(' |')
    }

    output.push(`${headerRow.join('')}${standardEOL}`);

    // Next we add in the divider row between the header and table contents
    const dividerRow = ['| '];
    for (let i = 0; i < columnsCount; ++i) {
        dividerRow.push(' --- |');
    }
    dividerRow.push(standardEOL);
    output.push(dividerRow.join(''));

    // Now render the rows. Rows can be rendered via renderNode without issue.
    // Table rows will automatically append EOLs to the end of their row, so we wont need to add them here
    output.push(... tableNode.children.map(childRow => renderer.renderNode(childRow)));

    return output.join();
}
