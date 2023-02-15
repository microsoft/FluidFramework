/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ApiItem } from "@microsoft/api-extractor-model";

import { MarkdownDocumenterConfiguration } from "../../Configuration";
import { SectionNode } from "../../documentation-domain";

/**
 * Default transformation helper for rendering item kinds that do not have children.
 */
export function transformApiItemWithoutChildren(
	apiItem: ApiItem,
	config: Required<MarkdownDocumenterConfiguration>,
): SectionNode[] {
	// Items without children don't have much information to provide other than the default
	// rendered details.
	return config.createChildContentSections(apiItem, undefined, config);
}
