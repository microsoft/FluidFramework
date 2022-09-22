import { ParagraphNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";
import { markdownEOL } from "./Utilities";

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
