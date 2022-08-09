import { DocSection, TSDocConfiguration } from "@microsoft/tsdoc";

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
