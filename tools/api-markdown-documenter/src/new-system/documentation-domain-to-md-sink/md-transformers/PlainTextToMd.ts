import { PlainTextNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";

/**
 * Converts a PlainTextNode into markdown
 *
 * @param textNode - PlainTextNode to convert into markdown
 * @param renderer - Renderer to provide rendering details about the node
 * @remarks Will strip trailing whitespace and insert HTML bold, italic, and strike tags as informed by the renderer
 * @returns The markdown representation of the PlainTextNode as a string
 */
export function PlainTextToMarkdown(
    textNode: PlainTextNode,
    renderer: DocumentationNodeRenderer,
): string {
    // TODO: Include leading whitespace but trim trailing
    const output: string[] = [""];

    let tagsChecked = [
        { predicate: renderer.applyingBold, enter: "<b>", exit: "</b>" },
        { predicate: renderer.applyingItalic, enter: "<i>", exit: "</i>" },
        { predicate: renderer.applyingStrikethrough, enter: "<strike>", exit: "</strike>" },
    ];

    // Add bold, underline, strikethrough entry tags
    for (let tag of tagsChecked) {
        if (tag.predicate) {
            output.push(tag.enter);
        }
    }

    // Add actual content
    output.push(textNode.value);

    // Add bold, underline, strikethrough exit tags
    for (let tag of tagsChecked) {
        if (tag.predicate) {
            output.push(tag.exit);
        }
    }

    return output.join("");
}
