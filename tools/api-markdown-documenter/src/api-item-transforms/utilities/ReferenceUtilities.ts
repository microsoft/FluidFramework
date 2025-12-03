/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ApiItem } from "@microsoft/api-extractor-model";
import type { DocDeclarationReference } from "@microsoft/tsdoc";
import type { Link } from "mdast";

import { resolveSymbolicReference } from "../../utilities/index.js";
import type { ApiItemTransformationConfiguration } from "../configuration/index.js";

import { getLinkForApiItem, shouldItemBeIncluded } from "./ApiItemTransformUtilities.js";

/**
 * Resolves a symbolic link and creates a URL to the target.
 *
 * @param contextApiItem - See {@link TsdocNodeTransformOptions.contextApiItem}.
 * @param codeDestination - The link reference target.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
export function resolveSymbolicLink(
	contextApiItem: ApiItem,
	codeDestination: DocDeclarationReference,
	config: ApiItemTransformationConfiguration,
): Link | undefined {
	const { apiModel, logger } = config;

	let resolvedReference: ApiItem;
	try {
		resolvedReference = resolveSymbolicReference(contextApiItem, codeDestination, apiModel);
	} catch (error: unknown) {
		logger.warning((error as Error).message);
		return undefined;
	}

	// Return undefined if the resolved API item should be excluded based on release tags
	if (!shouldItemBeIncluded(resolvedReference, config)) {
		logger.verbose("Excluding link to item based on release tags");
		return undefined;
	}

	return getLinkForApiItem(resolvedReference, config);
}
