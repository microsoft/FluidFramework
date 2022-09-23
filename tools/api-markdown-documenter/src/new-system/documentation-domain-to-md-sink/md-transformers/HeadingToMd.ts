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
    const output: string[] = [newlineOrBlankSpace(renderer.countTrailingNewlines < 2)];
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
            renderer.countTrailingNewlines < 1,
        )}${standardEOL}`, // Markdown best practices: Include one extra newline after a header
    );

    return output.join("");
}
