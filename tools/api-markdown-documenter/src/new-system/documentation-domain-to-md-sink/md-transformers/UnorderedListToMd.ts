import { UnorderedListNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";
import { addNewlineOrBlank, standardEOL } from "./Utilities";

/**
 * Recursively enumerates an UnorderedListNode to generate an ordered list in markdown
 *
 * @param listNode - UnorderedListNode to convert into markdown
 * @param renderer - Renderer to recursively render child subtrees
 * @returns The markdown representation of the UnorderedListNode as a string
 */
export function UnorderedListToMarkdown(
    listNode: UnorderedListNode,
    renderer: DocumentationNodeRenderer,
): string {
    const output: string[] = [addNewlineOrBlank(renderer.countTrailingNewlines < 1)];

    output.push(
        ...listNode.children.map(
            (child) =>
                `- ${renderer.renderNode(child)}${addNewlineOrBlank(
                    renderer.countTrailingNewlines < 1,
                )}`,
        ),
    );

    output.push(addNewlineOrBlank(renderer.countTrailingNewlines < 1));
    output.push(standardEOL);

    return output.join("");
}
