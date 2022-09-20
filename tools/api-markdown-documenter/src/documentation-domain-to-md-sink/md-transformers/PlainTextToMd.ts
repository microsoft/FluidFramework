import { PlainTextNode } from "../../documentation-domain";

export function PlainTextToMarkdown(
    textNode: PlainTextNode
): string {
    // TODO: Assert type?
    return textNode.value;
}
