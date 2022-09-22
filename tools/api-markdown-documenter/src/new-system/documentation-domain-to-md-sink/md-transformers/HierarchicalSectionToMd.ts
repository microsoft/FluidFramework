import { HierarchicalSectionNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";
import { getEscapedText, addNewlineOrBlank as newlineOrBlankSpace, standardEOL } from "./Utilities";

export function HierarchicalSectionToMarkdown(
    sectionNode: HierarchicalSectionNode,
    renderer: DocumentationNodeRenderer,
): string {
    renderer.increaseHierarchicalDepth();

    const output: string[] = [newlineOrBlankSpace(renderer.getLastRenderedCharacter())];

    // Starting with an empty line to ensure a newline gets added at the start of this section
    const headingLevel = sectionNode.heading?.level ?? renderer.hierarchyDepth;

    if (sectionNode.heading) {
        const headerLine: string[] = [];
        switch (headingLevel) {
            case 1:
                headerLine.push("##");
                break;
            case 2:
                headerLine.push("###");
                break;
            case 3:
                headerLine.push("###");
                break;
            default:
                headerLine.push("####");
        }
        headerLine.push(
            getEscapedText(renderer.renderNode(sectionNode.heading.value)) +
                newlineOrBlankSpace(renderer.getLastRenderedCharacter()),
        );
        output.push(`${standardEOL}${headerLine.join(" ")}${standardEOL}`); // Markdown best practices: surround headers with newlines
    }

    if (sectionNode.children.length) {
        output.push(renderer.renderNodes(sectionNode.children));
        output.push(newlineOrBlankSpace(renderer.getLastRenderedCharacter())); // Add a line if the last content element didn't
    }

    return output.join("");
}
