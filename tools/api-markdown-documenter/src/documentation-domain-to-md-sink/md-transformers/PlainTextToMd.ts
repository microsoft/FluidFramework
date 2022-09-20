import { PlainTextNode } from "../../documentation-domain";
import { DocumentationNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";

export function PlainTextToMarkdown(
    textNode: DocumentationNode,
    renderer: DocumentationNodeRenderer,
): string {
    // TODO: Assert type?
    return (textNode as PlainTextNode).value;
}
