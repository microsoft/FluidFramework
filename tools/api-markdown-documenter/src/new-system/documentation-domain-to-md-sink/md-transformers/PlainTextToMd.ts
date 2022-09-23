import { PlainTextNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";

export function PlainTextToMarkdown(
    textNode: PlainTextNode,
    renderer: DocumentationNodeRenderer,
): string {
    // split out the [ leading whitespace, content, trailing whitespace ]
    const parts = textNode.value.match(/^(\s*)(.*?)(\s*)$/) || [];

    // If there's no actual content (eg, parts[1] is empty), return the leading space
    if (parts.length === 0) return "";
    if (parts.length === 1 || !parts[1] || parts[1].length === 0) return parts[0];

    const output = [parts[0]]; // Start by including the leading whitespace

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
