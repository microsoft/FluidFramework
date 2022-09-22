import { HierarchicalSectionNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";
import { getEscapedText, addNewlineOrBlank as newlineOrBlankSpace } from "./Utilities";

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
        headerLine.push(getEscapedText(renderer.renderNode(sectionNode.heading.value)));
        output.push(headerLine.join(" "));
    }
    if (sectionNode.heading) {
        headerLine.push(getEscapedText(renderer.renderNode(sectionNode.heading.value)));
    }
    output.push(headerLine.join(" "));
    output.push(newlineOrBlankSpace(renderer.getLastRenderedCharacter())); // Add a line between the header and content

    const rows = sectionNode.children.map(
        (child) =>
            renderer.renderNode(child) + newlineOrBlankSpace(renderer.getLastRenderedCharacter()),
    );
    output.push(...rows);

    return output.join("");
}
