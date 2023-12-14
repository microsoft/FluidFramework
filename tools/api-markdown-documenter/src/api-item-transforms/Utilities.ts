/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	type ApiItem,
	type IResolveDeclarationReferenceResult,
} from "@microsoft/api-extractor-model";
import { type DocDeclarationReference } from "@microsoft/tsdoc";

import { DocumentNode, type SectionNode } from "../documentation-domain";
import { type Link } from "../Link";
import { getDocumentPathForApiItem, getLinkForApiItem } from "./ApiItemTransformUtilities";
import { type TsdocNodeTransformOptions } from "./TsdocNodeTransforms";
import { type ApiItemTransformationConfiguration } from "./configuration";
import { wrapInSection } from "./helpers";

/**
 * Creates a {@link DocumentNode} representing the provided API item.
 *
 * @param documentItem - The API item to be documented.
 * @param sections - An array of sections to be included in the document.
 * @param config - The transformation configuration for the API item.
 *
 * @returns A {@link DocumentNode} representing the constructed document.
 */
export function createDocument(
	documentItem: ApiItem,
	sections: SectionNode[],
	config: Required<ApiItemTransformationConfiguration>,
): DocumentNode {
	// Wrap sections in a root section if top-level heading is requested.
	const contents = config.includeTopLevelDocumentHeading
		? [wrapInSection(sections, { title: config.getHeadingTextForItem(documentItem) })]
		: sections;

	const frontMatter = generateFrontMatter(documentItem, config);

	return new DocumentNode({
		apiItem: documentItem,
		children: contents,
		documentPath: getDocumentPathForApiItem(documentItem, config),
		frontMatter,
	});
}

/**
 * Create {@link TsdocNodeTransformOptions} for the provided context API item and the system config.
 *
 * @param contextApiItem - See {@link TsdocNodeTransformOptions.contextApiItem}.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 *
 * @returns An option for {@link @microsoft/tsdoc#DocNode} transformations
 */
export function getTsdocNodeTransformationOptions(
	contextApiItem: ApiItem,
	config: Required<ApiItemTransformationConfiguration>,
): TsdocNodeTransformOptions {
	return {
		contextApiItem,
		resolveApiReference: (codeDestination): Link | undefined =>
			resolveSymbolicLink(contextApiItem, codeDestination, config),
		logger: config.logger,
	};
}

/**
 * Helper function to generate the front matter based on the provided configuration.
 */
function generateFrontMatter(
	documentItem: ApiItem,
	config: Required<ApiItemTransformationConfiguration>,
): string | undefined {
	if (config.frontMatter === undefined) {
		return undefined;
	}

	if (typeof config.frontMatter === "string") {
		return config.frontMatter;
	}

	if (typeof config.frontMatter !== "function") {
		throw new TypeError(
			"Invalid `frontMatter` configuration provided. Must be either a string or a function.",
		);
	}

	return config.frontMatter(documentItem);
}

/**
 * Resolves a symbolic link and creates a URL to the target.
 *
 * @param contextApiItem - See {@link TsdocNodeTransformOptions.contextApiItem}.
 * @param codeDestination - The link reference target.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
function resolveSymbolicLink(
	contextApiItem: ApiItem,
	codeDestination: DocDeclarationReference,
	config: Required<ApiItemTransformationConfiguration>,
): Link | undefined {
	const { apiModel, logger } = config;

	const resolvedReference: IResolveDeclarationReferenceResult =
		apiModel.resolveDeclarationReference(codeDestination, contextApiItem);

	if (resolvedReference.resolvedApiItem === undefined) {
		logger.warning(
			`Unable to resolve reference "${codeDestination.emitAsTsdoc()}" from "${contextApiItem.getScopedNameWithinPackage()}":`,
			resolvedReference.errorMessage,
		);

		return undefined;
	}

	return getLinkForApiItem(resolvedReference.resolvedApiItem, config);
}
