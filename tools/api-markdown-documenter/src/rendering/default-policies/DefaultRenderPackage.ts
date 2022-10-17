/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ApiItem, ApiPackage } from "@microsoft/api-extractor-model";
import { DocSection } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../Configuration";
import { renderModuleLikeSection } from "./DefaultRenderModuleLike";

/**
 * Default policy for rendering doc sections for `Package` items.
 */
export function renderPackageSection(
    apiPackage: ApiPackage,
    config: Required<MarkdownDocumenterConfiguration>,
    renderChild: (apiItem: ApiItem) => DocSection,
): DocSection {
    const entryPoints = apiPackage.entryPoints;
    if (entryPoints.length !== 1) {
        throw new Error(
            "Encountered a package with multiple entry-points. " +
                "API-Extractor only supports single-entry packages, so this should not be possible.",
        );
    }
    return renderModuleLikeSection(apiPackage, entryPoints[0].members, config, renderChild);
}
