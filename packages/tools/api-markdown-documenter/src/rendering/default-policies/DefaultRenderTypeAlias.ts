import { ApiTypeAlias } from "@microsoft/api-extractor-model";
import { DocParagraph, DocPlainText, DocSection, TSDocConfiguration } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";

export function renderTypeAliasSection(
    apiTypeAlias: ApiTypeAlias,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocSection {
    const innerSectionBody = new DocSection({ configuration: tsdocConfiguration }, [
        new DocParagraph({ configuration: tsdocConfiguration }, [
            new DocPlainText({
                configuration: tsdocConfiguration,
                text: "TODO: TypeAlias rendering",
            }),
        ]),
    ]);

    return documenterConfiguration.renderSectionBlock(
        apiTypeAlias,
        innerSectionBody,
        documenterConfiguration,
        tsdocConfiguration,
    );
}
