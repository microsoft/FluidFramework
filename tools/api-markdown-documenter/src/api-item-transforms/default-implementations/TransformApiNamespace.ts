/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ApiItem, ApiNamespace } from "@microsoft/api-extractor-model";

import { SectionNode } from "../../documentation-domain";
import { ApiItemTransformationConfiguration } from "../configuration";
import { transformApiModuleLike } from "./TransformApiModuleLike";

/**
 * Default policy for rendering doc sections for `Namespace` items.
 */
export function transformApiNamespace(
	apiNamespace: ApiNamespace,
	config: Required<ApiItemTransformationConfiguration>,
	generateChildContent: (apiItem: ApiItem) => SectionNode[],
): SectionNode[] {
	return transformApiModuleLike(apiNamespace, apiNamespace.members, config, generateChildContent);
}
