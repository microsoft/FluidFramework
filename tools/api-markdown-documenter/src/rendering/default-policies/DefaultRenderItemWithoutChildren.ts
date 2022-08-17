/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ApiItem } from "@microsoft/api-extractor-model";
import { DocSection } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";

/**
 * Default policy for rendering doc sections for API item kinds that do not have child contents.
 */
export function renderItemWithoutChildren(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection {
    // Items without children don't have much information to provide other than the default
    // rendered details.
    return config.renderChildrenSection(apiItem, undefined, config);
}
