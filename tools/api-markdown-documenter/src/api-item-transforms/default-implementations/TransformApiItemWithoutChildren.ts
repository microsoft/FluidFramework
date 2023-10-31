/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ApiItem } from "@microsoft/api-extractor-model";

import { SectionNode } from "../../documentation-domain";
import { ApiItemTransformationConfiguration } from "../configuration";

/**
 * Default transformation helper for rendering item kinds that do not have children.
 */
export function transformApiItemWithoutChildren(
	apiItem: ApiItem,
	config: Required<ApiItemTransformationConfiguration>,
): SectionNode[] {
	// Items without children don't have much information to provide other than the default
	// rendered details.
	return config.createDefaultLayout(apiItem, undefined, config);
}
