/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ApiItem, IResolveDeclarationReferenceResult } from "@microsoft/api-extractor-model";
import { DocDeclarationReference } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../Configuration";
import { Link } from "../Link";
import { DocumentNode, SectionNode } from "../documentation-domain";
import { getFilePathForApiItem, getLinkForApiItem } from "../utilities";
import { DocNodeTransformOptions } from "./DocNodeTransforms";
import { wrapInSection } from "./helpers";

/**
 * Helper function for creating a {@link DocumentNode} for an API item and its generated documentation contents.
 */
export function createDocument(
	documentItem: ApiItem,
	sections: SectionNode[],
	config: Required<MarkdownDocumenterConfiguration>,
): DocumentNode {
	let contents: SectionNode[] = sections;

	// If a top-level heading was requested, we will wrap our document sections in a root section
	// with the appropriate heading to ensure hierarchy is adjusted appropriately.
	if (config.includeTopLevelDocumentHeading) {
		contents = [wrapInSection(sections, { title: config.headingTitlePolicy(documentItem) })];
	}

	const frontMatter =
		config.frontMatterPolicy === undefined ? undefined : config.frontMatterPolicy(documentItem);

	return new DocumentNode({
		children: contents,
		filePath: getFilePathForApiItem(documentItem, config),
		frontMatter,
	});
}

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
		resolveApiReference: (codeDestination): Link | undefined =>
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
