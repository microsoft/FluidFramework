import { AlertNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";
import { standardEOL } from "./Utilities";

export function AlertToMarkdown(alertNode: AlertNode, renderer: DocumentationNodeRenderer): string {
    let headerText = `<bold> [${alertNode.alertKind}]`;
    if (alertNode.title) {
        headerText += `: ${alertNode.title}`;
    }
    headerText += " </bold>";

    let output: string[] = [headerText, standardEOL];
    output.push(...renderer.renderNodes(alertNode.children));
    output = output.map((line) => `> ${line}`);
    output.unshift(standardEOL);
    output.push(standardEOL);
    return output.join("");
}
