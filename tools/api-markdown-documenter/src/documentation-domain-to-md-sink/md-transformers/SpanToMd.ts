import { SpanNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";

export function SpanNodeToMarkdown(
    span: SpanNode,
    renderer: DocumentationNodeRenderer,
): string {
    let output: string[] = [];
    let setBold = false;
    let setItalics = false;
    let setStrikethrough = false;
    if (span.textFormatting) {
        const formatting = span.textFormatting;
        if (formatting.bold && !renderer.applyingBold) {
            output.push('**');
            renderer.applyingBold = true;
            setBold = true;
        }
        if (formatting.italic && !renderer.applyingItalics) {
            output.push('__');
            renderer.applyingItalics = true;
            setItalics = true;
        }
        if (formatting.strikethrough && !renderer.applyingStrikethrough) {
            output.push('~~');
            renderer.applyingStrikethrough = true;
            setStrikethrough = true;
        }
    }
    output.push(...span.children.map(child => renderer.renderNode(child)));
    if (setItalics) {
        output.push('__');
        renderer.applyingItalics = false;
    }
    if (setBold) {
        output.push('**');
        renderer.applyingBold = false;
    }
    if (setStrikethrough) {
        output.push('~~');
        renderer.applyingStrikethrough = false;
    }

    return output.join('');
}
