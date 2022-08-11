import { ApiNamespace } from "@microsoft/api-extractor-model";
import { DocParagraph, DocPlainText, DocSection, TSDocConfiguration } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";

export function renderNamespaceSection(
    apiNamespace: ApiNamespace,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocSection {
    const innerSectionBody = new DocSection({ configuration: tsdocConfiguration }, [
        new DocParagraph({ configuration: tsdocConfiguration }, [
            new DocPlainText({
                configuration: tsdocConfiguration,
                text: "TODO: Namespace rendering",
            }),
        ]),
    ]);

    return documenterConfiguration.renderSectionBlock(
        apiNamespace,
        innerSectionBody,
        documenterConfiguration,
        tsdocConfiguration,
    );
}
