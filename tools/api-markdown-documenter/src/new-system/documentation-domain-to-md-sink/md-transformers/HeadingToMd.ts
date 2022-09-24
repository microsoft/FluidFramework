import { HeadingNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";
import { addNewlineOrBlank, standardEOL } from "./Utilities";

/**
 * Maximum heading level supported by most systems.
 *
 * @remarks This corresponds with the max HTML heading level.
 */
export const maxHeadingLevel = 6;

/**
 * Converts a HeadingNode to markdown. Will use the renderer's hierarchyDepth to set an appropriate depth for the header if no override is supplied on the node.
 *
 * @param headingNode - Node to convert to a header
 * @param renderer - Renderer to recursively render node subtree
 * @returns The markdown representation of the Heading node as a string
 */
export function HeadingToMarkdown(
    headingNode: HeadingNode,
    renderer: DocumentationNodeRenderer,
): string {
    const output: string[] = [addNewlineOrBlank(
        renderer.countTrailingNewlines < 2,
    )];
    const headingLevel = headingNode.level ?? renderer.hierarchyDepth;
    const headerLine: string[] = [];

    const renderAsMarkdownHeading = headingLevel <= maxHeadingLevel;

    if (renderAsMarkdownHeading) {
        const prefix = "#".repeat(headingLevel);
        headerLine.push(prefix);
    } else {
        // TODO: ID above bold text? Confirm support.
        // If the heading level is beyond the max, we will simply render the title as bolded text
        renderer.setBold();
    }

    headerLine.push(renderer.renderNodes(headingNode.children));

    if (renderAsMarkdownHeading && headingNode.id) {
        headerLine.push(`{#${headingNode.id}}`);
    }

    output.push(headerLine.join(" "));
    output.push(addNewlineOrBlank(
        renderer.countTrailingNewlines < 1,
    ));
    // Markdown best practices: Include one extra newline after a header
    output.push(standardEOL);

    return output.join("");
}
