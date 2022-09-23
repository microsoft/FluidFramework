import { HierarchicalSectionNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";
import { addNewlineOrBlank } from "./Utilities";

export function HierarchicalSectionToMarkdown(
    sectionNode: HierarchicalSectionNode,
    renderer: DocumentationNodeRenderer,
): string {
    renderer.increaseHierarchicalDepth();

    const output: string[] = [addNewlineOrBlank(renderer.countTrailingNewlines < 1)];
    if (sectionNode.heading) {
        output.push(renderer.renderNode(sectionNode.heading));
    }

    if (sectionNode.children.length) {
        output.push(renderer.renderNodes(sectionNode.children));
        output.push(addNewlineOrBlank(renderer.countTrailingNewlines < 1)); // Add a line if the last content element didn't
    }

    return output.join("");
}
