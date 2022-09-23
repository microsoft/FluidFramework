import { HierarchicalSectionNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";
import { addNewlineOrBlank, countTrailingNewlines } from "./Utilities";

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
        const renderedChildren = renderer.renderNodes(sectionNode.children);
        output.push(renderedChildren);
        output.push(addNewlineOrBlank(countTrailingNewlines(renderedChildren) < 1)); // Add a line if the last content element didn't
    }

    return output.join("");
}
