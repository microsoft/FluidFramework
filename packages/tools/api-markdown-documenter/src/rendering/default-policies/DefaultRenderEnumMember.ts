import { ApiEnumMember } from "@microsoft/api-extractor-model";
import { DocParagraph, DocPlainText, DocSection, TSDocConfiguration } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";

export function renderEnumMemberSection(
    apiEnumMember: ApiEnumMember,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocSection {
    const innerSectionBody = new DocSection({ configuration: tsdocConfiguration }, [
        new DocParagraph({ configuration: tsdocConfiguration }, [
            new DocPlainText({
                configuration: tsdocConfiguration,
                text: "TODO: Enum rendering",
            }),
        ]),
    ]);

    return documenterConfiguration.renderSectionBlock(
        apiEnumMember,
        innerSectionBody,
        documenterConfiguration,
        tsdocConfiguration,
    );
}
