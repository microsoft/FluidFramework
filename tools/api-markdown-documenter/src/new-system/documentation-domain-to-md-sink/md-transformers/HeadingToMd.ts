import { HeadingNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";
import {
    addNewlineOrBlank,
    addNewlineOrBlank as newlineOrBlankSpace,
    standardEOL,
} from "./Utilities";

export function HeadingToMarkdown(
    headingNode: HeadingNode,
    renderer: DocumentationNodeRenderer,
): string {
    // Starting with an empty line to ensure a newline gets added at the start of this section
    const output: string[] = [newlineOrBlankSpace(renderer.getLastRenderedCharacter())];

    // Starting with an empty line to ensure a newline gets added at the start of this section
    const headingLevel = headingNode.level ?? renderer.hierarchyDepth;
    const headerLine: string[] = [];
    switch (headingLevel) {
        case 1:
            headerLine.push("##");
            break;
        case 2:
            headerLine.push("###");
            break;
        case 3:
            headerLine.push("###");
            break;
        default:
            headerLine.push("####");
    }
    headerLine.push(renderer.renderNodes(headingNode.children));
    output.push(
        `${headerLine.join(" ")}${addNewlineOrBlank(
            renderer.getLastRenderedCharacter(),
        )}${standardEOL}`, // Markdown best practices: Include one extra newline after a header
    );

    return output.join("");
}
