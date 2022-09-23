import { AlertNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";
import { standardEOL } from "./Utilities";

/**
 * Recursively enumerates an AlertNode to generate a markdown representation of the node.
 *
 * @param alertNode - AlertNode to convert into markdown
 * @param renderer - Renderer to recursively render child subtrees
 * @returns The markdown representation of the AlertNode as a string
 */
export function AlertToMarkdown(alertNode: AlertNode, renderer: DocumentationNodeRenderer): string {
    let headerText = `<bold> [${alertNode.alertKind}]`;
    if (alertNode.title) {
        headerText += `: ${alertNode.title}`;
    }
    headerText += ` </bold>${standardEOL}`;

    let output: string[] = [headerText, standardEOL];
    output.push(renderer.renderNodes(alertNode.children));
    output = output.map((line) => `> ${line}`);
    output.unshift(standardEOL);
    output.push(standardEOL);
    return output.join("");
}
