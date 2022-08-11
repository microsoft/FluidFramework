import { ApiPackage } from "@microsoft/api-extractor-model";
import { DocParagraph, DocPlainText, DocSection, TSDocConfiguration } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";

export function renderPackageSection(
    apiPackage: ApiPackage,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocSection {
    const innerSectionBody = new DocSection({ configuration: tsdocConfiguration }, [
        new DocParagraph({ configuration: tsdocConfiguration }, [
            new DocPlainText({
                configuration: tsdocConfiguration,
                text: "TODO: package rendering",
            }),
        ]),
    ]);

    return documenterConfiguration.renderSectionBlock(
        apiPackage,
        innerSectionBody,
        documenterConfiguration,
        tsdocConfiguration,
    );
}
