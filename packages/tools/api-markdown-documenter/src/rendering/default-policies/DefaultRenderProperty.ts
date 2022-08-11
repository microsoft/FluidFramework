import { ApiPropertyItem } from "@microsoft/api-extractor-model";
import { DocParagraph, DocPlainText, DocSection, TSDocConfiguration } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";

export function renderPropertySection(
    apiProperty: ApiPropertyItem,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocSection {
    const innerSectionBody = new DocSection({ configuration: tsdocConfiguration }, [
        new DocParagraph({ configuration: tsdocConfiguration }, [
            new DocPlainText({
                configuration: tsdocConfiguration,
                text: "TODO: Property rendering",
            }),
        ]),
    ]);

    return documenterConfiguration.renderSectionBlock(
        apiProperty,
        innerSectionBody,
        documenterConfiguration,
        tsdocConfiguration,
    );
}
