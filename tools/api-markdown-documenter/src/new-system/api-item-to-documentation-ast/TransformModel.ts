/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ApiModel } from "@microsoft/api-extractor-model";

import { MarkdownDocumenterConfiguration } from "../../Configuration";
import { DocumentNode, HierarchicalSectionNode } from "../documentation-domain";
import { createDocument } from "./Utilities";

/**
 * Generates a {@link DocumentNode} for the specified `apiModel`.
 *
 * @param apiModel - The API model content to be rendered. Represents the root of the API suite.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 *
 * @returns The rendered Markdown document.
 */
export function apiModelToDocument(
    apiModel: ApiModel,
    config: Required<MarkdownDocumenterConfiguration>,
): DocumentNode {
    const logger = config.logger;

    logger.verbose(`Rendering API Model document...`);

    const sections: HierarchicalSectionNode[] = [];

    // Do not render breadcrumb for Model document

    // Render body contents
    sections.push(config.transformApiModel(apiModel, config));

    logger.verbose(`API Model document rendered successfully.`);

    return createDocument(apiModel, sections, config);
}
