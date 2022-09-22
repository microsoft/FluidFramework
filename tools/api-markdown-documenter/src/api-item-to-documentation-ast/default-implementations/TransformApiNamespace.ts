/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ApiItem, ApiNamespace } from "@microsoft/api-extractor-model";

import { MarkdownDocumenterConfiguration } from "../../Configuration";
import { HierarchicalSectionNode } from "../../documentation-domain";
import { transformApiModuleLike } from "./TransformApiModuleLike";

/**
 * Default policy for rendering doc sections for `Namespace` items.
 */
export function transformApiNamespace(
    apiNamespace: ApiNamespace,
    config: Required<MarkdownDocumenterConfiguration>,
    generateChildContent: (apiItem: ApiItem) => HierarchicalSectionNode,
): HierarchicalSectionNode {
    return transformApiModuleLike(apiNamespace, apiNamespace.members, config, generateChildContent);
}
