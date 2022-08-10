import { ApiCallSignature } from "@microsoft/api-extractor-model";
import { DocParagraph, DocPlainText, DocSection, TSDocConfiguration } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";

export function renderCallSignatureSection(
    apiCallSignature: ApiCallSignature,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocSection {
    return new DocSection({ configuration: tsdocConfiguration }, [
        new DocParagraph({ configuration: tsdocConfiguration }, [
            new DocPlainText({
                configuration: tsdocConfiguration,
                text: "TODO: CallSignature rendering",
            }),
        ]),
    ]);
}
