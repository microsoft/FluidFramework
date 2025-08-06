/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ApiItem, ApiNamespace } from "@microsoft/api-extractor-model";

import type { HierarchicalSection } from "../../mdast/index.js";
import type { ApiItemTransformationConfiguration } from "../configuration/index.js";

import { transformApiModuleLike } from "./TransformApiModuleLike.js";

/**
 * Default documentation transform for `Namespace` items.
 */
export function transformApiNamespace(
	apiNamespace: ApiNamespace,
	config: ApiItemTransformationConfiguration,
	generateChildContent: (apiItem: ApiItem) => HierarchicalSection[],
): HierarchicalSection[] {
	return transformApiModuleLike(apiNamespace, config, generateChildContent);
}
