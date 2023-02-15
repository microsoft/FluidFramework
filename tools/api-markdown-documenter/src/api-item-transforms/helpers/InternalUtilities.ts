/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ApiItem, IResolveDeclarationReferenceResult } from "@microsoft/api-extractor-model";
import { DocDeclarationReference } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../Configuration";
import { UrlTarget } from "../../Link";
import { getLinkUrlForApiItem } from "../../utilities";
import { DocNodeTransformOptions } from "../DocNodeTransforms";

/**
 * Create {@link DocNodeTransformOptions} for the provided context API item and the system config.
 *
 * @param contextApiItem - See {@link DocNodeTransformOptions.contextApiItem}.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function getDocNodeTransformationOptions(
	contextApiItem: ApiItem,
	config: Required<MarkdownDocumenterConfiguration>,
): DocNodeTransformOptions {
	return {
		contextApiItem,
		resolveApiReference: (codeDestination): string | undefined =>
			resolveSymbolicLink(contextApiItem, codeDestination, config),
		logger: config.logger,
	};
}

/**
 * Resolves a symbolic link and creates a URL to the target.
 *
 * @param contextApiItem - See {@link DocNodeTransformOptions.contextApiItem}.
 * @param codeDestination - The link reference target.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
function resolveSymbolicLink(
	contextApiItem: ApiItem,
	codeDestination: DocDeclarationReference,
	config: Required<MarkdownDocumenterConfiguration>,
): UrlTarget | undefined {
	const { apiModel, logger } = config;

	const resolvedReference: IResolveDeclarationReferenceResult =
		apiModel.resolveDeclarationReference(codeDestination, contextApiItem);

	if (resolvedReference.resolvedApiItem === undefined) {
		logger.warning(
			`Unable to resolve reference "${codeDestination.emitAsTsdoc()}": ${
				resolvedReference.errorMessage
			}`,
		);

		return undefined;
	}

	return getLinkUrlForApiItem(resolvedReference.resolvedApiItem, config);
}
