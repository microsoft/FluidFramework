import { ApiClass } from "@microsoft/api-extractor-model";
import { DocParagraph, DocPlainText, DocSection, TSDocConfiguration } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";

export function renderClassSection(
    apiClass: ApiClass,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocSection {
    const innerSectionBody = new DocSection({ configuration: tsdocConfiguration }, [
        new DocParagraph({ configuration: tsdocConfiguration }, [
            new DocPlainText({
                configuration: tsdocConfiguration,
                text: "TODO: Class rendering",
            }),
        ]),
    ]);

    return documenterConfiguration.renderSectionBlock(
        apiClass,
        innerSectionBody,
        documenterConfiguration,
        tsdocConfiguration,
    );
}
