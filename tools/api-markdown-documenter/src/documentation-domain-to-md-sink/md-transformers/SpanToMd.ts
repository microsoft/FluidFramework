import { SpanNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";

export function SpanNodeToMarkdown(
    span: SpanNode,
    renderer: DocumentationNodeRenderer,
): string {
    let output: string[] = [];
    if (span.textFormatting) {
        const { bold, italic, strikethrough } = span.textFormatting;
        if (bold) {
            renderer.setBold();
        }
        if (italic) {
            renderer.setItalic();
        }
        if (strikethrough) {
            renderer.setStrikethrough();
        }
    }

    if (span.children && span.children.length) {
        output.push(...span.children.map(child => renderer.renderNode(child)));
    }

    return output.join('');
}
