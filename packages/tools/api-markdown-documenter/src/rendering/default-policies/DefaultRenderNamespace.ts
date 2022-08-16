/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ApiItem, ApiNamespace } from "@microsoft/api-extractor-model";
import { DocSection } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";
import { renderModuleLikeSection } from "./DefaultRenderModuleLike";

/**
 * Default policy for rendering doc sections for `Namespace` items.
 */
export function renderNamespaceSection(
    apiNamespace: ApiNamespace,
    config: Required<MarkdownDocumenterConfiguration>,
    renderChild: (apiItem: ApiItem) => DocSection,
): DocSection {
    return renderModuleLikeSection(apiNamespace, apiNamespace.members, config, renderChild);
}
