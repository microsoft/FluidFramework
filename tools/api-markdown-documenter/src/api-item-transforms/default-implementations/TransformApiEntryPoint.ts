/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ApiEntryPoint, ApiItem } from "@microsoft/api-extractor-model";

import type { SectionNode } from "../../documentation-domain/index.js";
import type { ApiItemTransformationConfiguration } from "../configuration/index.js";

import { transformApiModuleLike } from "./TransformApiModuleLike.js";

/**
 * Default documentation transform for package entry-points.
 */
export function transformApiEntryPoint(
	apiEntryPoint: ApiEntryPoint,
	config: ApiItemTransformationConfiguration,
	generateChildContent: (apiItem: ApiItem) => SectionNode[],
): SectionNode[] {
	return transformApiModuleLike(apiEntryPoint, config, generateChildContent);
}
