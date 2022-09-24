import { OrderedListNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";
import { addNewlineOrBlank, standardEOL } from "./Utilities";

/**
 * Recursively enumerates an OrderedListNode to generate an ordered list in markdown
 *
 * @param listNode - OrderedListNode to convert into markdown
 * @param renderer - Renderer to recursively render child subtrees
 * @returns The markdown representation of the OrderedListNode as a string
 */
export function OrderedListToMarkdown(
    listNode: OrderedListNode,
    renderer: DocumentationNodeRenderer,
): string {
    const output: string[] = [addNewlineOrBlank(renderer.countTrailingNewlines < 1)];

    output.push(
        ...listNode.children.map(
            (child, index) =>
                `${index + 1}. ${renderer.renderNode(child)}${addNewlineOrBlank(
                    renderer.countTrailingNewlines < 1,
                )}`,
        ),
    );

    output.push(addNewlineOrBlank(renderer.countTrailingNewlines < 1));
    output.push(standardEOL);

    return output.join("");
}
