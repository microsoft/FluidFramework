import { ParagraphNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";
import { markdownEOL } from "./Utilities";

/**
 * Recursively enumerates an ParagraphNode to generate a paragraph of text.
 *
 * @param paragraph - ParagraphNode to convert into markdown
 * @param renderer - Renderer to recursively render child subtrees
 * @remarks If being rendered inside of a table, will output using HTML paragraph tags
 * @returns The markdown representation of the ParagraphNode as a string
 */
export function ParagraphToMarkdown(
    paragraph: ParagraphNode,
    renderer: DocumentationNodeRenderer,
): string {
    const childContents: string = renderer.renderNodes(paragraph.children).trim();

    if (renderer.isInsideTable) {
        return childContents === "" ? "" : `<p>${childContents}</p>`;
    }

    return `${childContents}${markdownEOL}`;
}
