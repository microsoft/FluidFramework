import { ApiItem, ApiNamespace } from "@microsoft/api-extractor-model";
import { DocSection, TSDocConfiguration } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";
import { renderModuleLikeSection } from "./DefaultRenderModuleLike";

export function renderNamespaceSection(
    apiNamespace: ApiNamespace,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
    renderChild: (apiItem: ApiItem) => DocSection,
): DocSection {
    return renderModuleLikeSection(
        apiNamespace,
        apiNamespace.members,
        documenterConfiguration,
        tsdocConfiguration,
        renderChild,
    );
}
