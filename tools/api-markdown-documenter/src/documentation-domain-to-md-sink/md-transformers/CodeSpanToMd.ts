import { CodeSpanNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";
import { getTableEscapedText, standardEOL } from "./Utilities";

export function CodeSpanToMarkdown(
    codeSpanNode: CodeSpanNode,
    renderer: DocumentationNodeRenderer,
): string {
    renderer.setInsideCodeBlock();
    const childContents = codeSpanNode.children.map((child) => renderer.renderNode(child)).join(""); // Render children

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
    return output.join(standardEOL);
}
