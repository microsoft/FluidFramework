/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ApiModel } from "@microsoft/api-extractor-model";

import { MarkdownDocumenterConfiguration } from "../Configuration";
import { DocumentNode } from "../documentation-domain";
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

	// Note: We don't render the breadcrumb for Model document, as it is always the root of the file hierarchical

	// Render body contents
	const sections = config.transformApiModel(apiModel, config);

	logger.verbose(`API Model document rendered successfully.`);

	return createDocument(apiModel, sections, config);
}
