import { FencedCodeBlockNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";
import { markdownEOL, standardEOL } from "./Utilities";

export function FencedCodeBlockToMarkdown(
    blockNode: FencedCodeBlockNode,
    renderer: DocumentationNodeRenderer,
): string {
    const output = [markdownEOL, "```" + blockNode.language, standardEOL];
    renderer.setInsideCodeBlock();
    const children = blockNode.children.map((child) => renderer.renderNode(child)).join("");
    output.push(children);
    output.push(standardEOL);
    output.push("```");

    return output.join("");
}
