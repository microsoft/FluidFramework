import { HierarchicalSectionNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";
import { getEscapedText, standardEOL } from "./Utilities";

export function HierarchicalSectionToMarkdown(
    sectionNode: HierarchicalSectionNode,
    renderer: DocumentationNodeRenderer,
): string {
    renderer.increaseHierarchicalDepth();

    const output = ['']; // Starting with an empty line to ensure a newline gets added at the start of this section
    const headingLevel = sectionNode.heading.level ?? renderer.hierarchyDepth;

    const headerLine: string[] = [];
    switch (headingLevel) {
        case 1:
            headerLine.push('##');
            break;
        case 2:
            headerLine.push('###');
            break;
        case 3:
            headerLine.push('###');
            break;
        default:
            headerLine.push('####');
    }
    headerLine.push(getEscapedText(renderer.renderNode(sectionNode.heading.value)));
    output.push(headerLine.join(' '));
    output.push(''); // Add a line between the header and content
    output.push(renderer.renderNodes(sectionNode.children));

    return output.join(standardEOL);
}
