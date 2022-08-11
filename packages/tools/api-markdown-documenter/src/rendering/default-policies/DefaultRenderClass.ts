import { ApiClass } from "@microsoft/api-extractor-model";
import {
    DocNode,
    DocParagraph,
    DocPlainText,
    DocSection,
    TSDocConfiguration,
} from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";

export function renderClassSection(
    apiClass: ApiClass,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocSection {
    const docNodes: DocNode[] = [];

    // Render constructors table
    // TODO
    docNodes.push(
        new DocParagraph({ configuration: tsdocConfiguration }, [
            new DocPlainText({
                configuration: tsdocConfiguration,
                text: "TODO: Constructors table",
            }),
        ]),
    );

    // Render properties table
    // TODO
    docNodes.push(
        new DocParagraph({ configuration: tsdocConfiguration }, [
            new DocPlainText({
                configuration: tsdocConfiguration,
                text: "TODO: Properties table",
            }),
        ]),
    );

    // Render call signatures table
    // TODO
    docNodes.push(
        new DocParagraph({ configuration: tsdocConfiguration }, [
            new DocPlainText({
                configuration: tsdocConfiguration,
                text: "TODO: CallSignatures table",
            }),
        ]),
    );

    // Render index signatures table
    // TODO
    docNodes.push(
        new DocParagraph({ configuration: tsdocConfiguration }, [
            new DocPlainText({
                configuration: tsdocConfiguration,
                text: "TODO: IndexSignatures table",
            }),
        ]),
    );

    // Render methods table
    // TODO
    docNodes.push(
        new DocParagraph({ configuration: tsdocConfiguration }, [
            new DocPlainText({
                configuration: tsdocConfiguration,
                text: "TODO: Methods table",
            }),
        ]),
    );

    // Render children (grouped)
    // TODO
    docNodes.push(
        new DocParagraph({ configuration: tsdocConfiguration }, [
            new DocPlainText({
                configuration: tsdocConfiguration,
                text: "TODO: Render children in groups",
            }),
        ]),
    );

    const innerSectionBody = new DocSection({ configuration: tsdocConfiguration }, docNodes);

    return documenterConfiguration.renderSectionBlock(
        apiClass,
        innerSectionBody,
        documenterConfiguration,
        tsdocConfiguration,
    );
}
