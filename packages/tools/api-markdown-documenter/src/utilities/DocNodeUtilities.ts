import { DocNodeKind, DocParagraph, DocSection, TSDocConfiguration } from "@microsoft/tsdoc";

// TODO: remove
export function appendSection(output: DocSection | DocParagraph, docSection: DocSection): void {
    for (const node of docSection.nodes) {
        output.appendNode(node);
    }
}

// TODO: remove
export function appendAndMergeSection(output: DocSection, docSection: DocSection): void {
    let firstNode: boolean = true;
    for (const node of docSection.nodes) {
        if (firstNode && node.kind === DocNodeKind.Paragraph) {
            output.appendNodesInParagraph(node.getChildNodes());
            firstNode = false;
            continue;
        }
        firstNode = false;

        output.appendNode(node);
    }
}

// TODO: remove?
export function mergeSections(
    sections: DocSection[],
    tsdocConfiguration: TSDocConfiguration,
): DocSection {
    const output = new DocSection({ configuration: tsdocConfiguration });

    for (const section of sections) {
        output.appendNodes(section.nodes);
    }

    return output;
}
