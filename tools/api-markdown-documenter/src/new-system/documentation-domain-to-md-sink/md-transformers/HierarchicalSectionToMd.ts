import { HierarchicalSectionNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";
import { addNewlineOrBlank as newlineOrBlankSpace } from "./Utilities";

export function HierarchicalSectionToMarkdown(
    sectionNode: HierarchicalSectionNode,
    renderer: DocumentationNodeRenderer,
): string {
    renderer.increaseHierarchicalDepth();

    const output: string[] = [newlineOrBlankSpace(renderer.getLastRenderedCharacter())];
    if (sectionNode.heading) {
        output.push(renderer.renderNode(sectionNode.heading));
    }

    if (sectionNode.children.length) {
        output.push(renderer.renderNodes(sectionNode.children));
        output.push(newlineOrBlankSpace(renderer.getLastRenderedCharacter())); // Add a line if the last content element didn't
    }

    return output.join("");
}
