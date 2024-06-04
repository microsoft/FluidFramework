/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ApiItemKind,
	type ApiItem,
	type IResolveDeclarationReferenceResult,
	type ApiPackage,
} from "@microsoft/api-extractor-model";
import { type DocDeclarationReference } from "@microsoft/tsdoc";

import { DocumentNode, type SectionNode } from "../documentation-domain/index.js";
import { type Link } from "../Link.js";
import {
	getDocumentPathForApiItem,
	getLinkForApiItem,
	shouldItemBeIncluded,
} from "./ApiItemTransformUtilities.js";
import { type TsdocNodeTransformOptions } from "./TsdocNodeTransforms.js";
import { type ApiItemTransformationConfiguration } from "./configuration/index.js";
import { wrapInSection } from "./helpers/index.js";

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

	return new DocumentNode({
		apiItem: documentItem,
		children: contents,
		documentPath: getDocumentPathForApiItem(documentItem, config),
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
			`Unable to resolve reference "${codeDestination.emitAsTsdoc()}" from "${getScopedMemberNameForDiagnostics(
				contextApiItem,
			)}":`,
			resolvedReference.errorMessage,
		);

		return undefined;
	}
	const resolvedApiItem = resolvedReference.resolvedApiItem;

	// Return undefined if the resolved API item should be excluded based on release tags
	if (!shouldItemBeIncluded(resolvedApiItem, config)) {
		logger.verbose("Excluding link to item based on release tags");
		return undefined;
	}

	return getLinkForApiItem(resolvedReference.resolvedApiItem, config);
}

/**
 * Creates a scoped member specifier for the provided API item, including the name of the package the item belongs to
 * if applicable.
 *
 * Intended for use in diagnostic messaging.
 */
export function getScopedMemberNameForDiagnostics(apiItem: ApiItem): string {
	return apiItem.kind === ApiItemKind.Package
		? (apiItem as ApiPackage).displayName
		: `${
				apiItem.getAssociatedPackage()?.displayName ?? "<NO-PACKAGE>"
		  }#${apiItem.getScopedNameWithinPackage()}`;
}
