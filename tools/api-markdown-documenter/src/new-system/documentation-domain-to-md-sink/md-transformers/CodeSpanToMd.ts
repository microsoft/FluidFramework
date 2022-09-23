import { CodeSpanNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";
import { getTableEscapedText } from "./Utilities";

/**
 * Recursively enumerates an CodeSpanNode to generate a markdown code span block.
 *
 * @param codeSpanNode - CodeSpanNode to convert into markdown
 * @param renderer - Renderer to recursively render child subtrees
 * @returns The markdown representation of the CodeSpanNode as a string
 */
export function CodeSpanToMarkdown(
    codeSpanNode: CodeSpanNode,
    renderer: DocumentationNodeRenderer,
): string {
    renderer.setInsideCodeBlock();
    const childContents = renderer.renderNodes(codeSpanNode.children);

    let output: string[] = [];
    if (renderer.isInsideTable) {
        output = [
            "<code>",
            getTableEscapedText(childContents).split(/\r?\n/g).join("</code><br/><code>"),
            "</code>",
        ];
    } else {
        output = ["`", childContents, "`"];
    }
    return output.join("");
}
