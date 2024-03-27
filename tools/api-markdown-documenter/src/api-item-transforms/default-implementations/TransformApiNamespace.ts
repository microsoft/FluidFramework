/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ApiItem, type ApiNamespace } from "@microsoft/api-extractor-model";

import { type SectionNode } from "../../documentation-domain/index.js";
import { type ApiItemTransformationConfiguration } from "../configuration/index.js";
import { transformApiModuleLike } from "./TransformApiModuleLike.js";

/**
 * Default documentation transform for `Namespace` items.
 */
export function transformApiNamespace(
	apiNamespace: ApiNamespace,
	config: Required<ApiItemTransformationConfiguration>,
	generateChildContent: (apiItem: ApiItem) => SectionNode[],
): SectionNode[] {
	return transformApiModuleLike(apiNamespace, config, generateChildContent);
}
