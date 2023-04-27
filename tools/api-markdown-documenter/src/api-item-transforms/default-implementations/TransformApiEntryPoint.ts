/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ApiEntryPoint, ApiItem } from "@microsoft/api-extractor-model";

import { SectionNode } from "../../documentation-domain";
import { ApiItemTransformationConfiguration } from "../configuration";
import { transformApiModuleLike } from "./TransformApiModuleLike";

/**
 * Default documentation transform for package entry-points.
 */
export function transformApiEntryPoint(
	apiEntryPoint: ApiEntryPoint,
	config: Required<ApiItemTransformationConfiguration>,
	generateChildContent: (apiItem: ApiItem) => SectionNode[],
): SectionNode[] {
	return transformApiModuleLike(
		apiEntryPoint,
		apiEntryPoint.members,
		config,
		generateChildContent,
	);
}
