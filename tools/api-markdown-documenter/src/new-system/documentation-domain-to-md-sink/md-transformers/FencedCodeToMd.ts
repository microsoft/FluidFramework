import { FencedCodeBlockNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";
import { addNewlineOrBlank, standardEOL } from "./Utilities";

export function FencedCodeBlockToMarkdown(
    blockNode: FencedCodeBlockNode,
    renderer: DocumentationNodeRenderer,
): string {
    const output = [
        addNewlineOrBlank(renderer.getLastRenderedCharacter()),
        "```" + blockNode.language,
        standardEOL,
    ];
    renderer.setInsideCodeBlock();
    const children = renderer.renderNodes(blockNode.children);
    output.push(children);
    output.push(addNewlineOrBlank(renderer.getLastRenderedCharacter()));
    output.push("```");
    output.push(standardEOL);

    return output.join("");
}
