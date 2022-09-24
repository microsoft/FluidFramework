import { HierarchicalSectionNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";
import { addNewlineOrBlank } from "./Utilities";

/**
 * Recursively enumerates an HierarchicalSectionNode to generate a markdown representation of the section, possibly including a header element.
 *
 * @param sectionNode - HierarchicalSectionNode to convert into markdown
 * @param renderer - Renderer to recursively render child subtrees
 * @remarks Automatically increases the hierarchical depth on the renderer, so that any header descendants rendered in the subtree will have an appropriate heading level.
 * @returns The markdown representation of the HierarchicalSectionNode as a string
 */
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
        output.push(addNewlineOrBlank(renderer.countTrailingNewlines < 1));
        output.push(renderer.renderNodes(sectionNode.children));
        output.push(addNewlineOrBlank(renderer.countTrailingNewlines < 1)); // Add a line if the last content element didn't
    }

    return output.join("");
}
