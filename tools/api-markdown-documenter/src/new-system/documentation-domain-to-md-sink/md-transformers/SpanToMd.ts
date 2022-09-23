import { SpanNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";

/**
 * Recursively enumerates an SpanNode to generate markdown from its children. Can be used to apply bold, italic, and strikethrough styles
 *
 * @param span - SpanNode to convert into markdown
 * @param renderer - Renderer to recursively render child subtrees
 * @returns The markdown representation of the SpanNode as a string
 */
export function SpanToMarkdown(span: SpanNode, renderer: DocumentationNodeRenderer): string {
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
        output.push(...span.children.map((child) => renderer.renderNode(child)));
    }

    return output.join("");
}
