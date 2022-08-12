import { ApiItem } from "@microsoft/api-extractor-model";
import { DocSection, TSDocConfiguration } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";

export function renderItemWithoutChildren(
    apiItem: ApiItem,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocSection {
    // Items without children don't have much information to provide other than the default
    // rendered details.
    return documenterConfiguration.renderSectionBlock(
        apiItem,
        undefined,
        documenterConfiguration,
        tsdocConfiguration,
    );
}
