import { ApiVariable } from "@microsoft/api-extractor-model";
import { DocParagraph, DocPlainText, DocSection, TSDocConfiguration } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";

export function renderVariableSection(
    apiVariable: ApiVariable,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocSection {
    const innerSectionBody = new DocSection({ configuration: tsdocConfiguration }, [
        new DocParagraph({ configuration: tsdocConfiguration }, [
            new DocPlainText({
                configuration: tsdocConfiguration,
                text: "TODO: Variable rendering",
            }),
        ]),
    ]);

    return documenterConfiguration.renderSectionBlock(
        apiVariable,
        innerSectionBody,
        documenterConfiguration,
        tsdocConfiguration,
    );
}
