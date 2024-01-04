/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { type ApiEntryPoint, type ApiItem } from "@microsoft/api-extractor-model";

import { type SectionNode } from "../../documentation-domain";
import { type ApiItemTransformationConfiguration } from "../configuration";
import { transformApiModuleLike } from "./TransformApiModuleLike";

/**
 * Default documentation transform for package entry-points.
 */
export function transformApiEntryPoint(
	apiEntryPoint: ApiEntryPoint,
	config: Required<ApiItemTransformationConfiguration>,
	generateChildContent: (apiItem: ApiItem) => SectionNode[],
): SectionNode[] {
	return transformApiModuleLike(apiEntryPoint, config, generateChildContent);
}
