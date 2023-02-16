/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ApiItem } from "@microsoft/api-extractor-model";

import { MarkdownDocumenterConfiguration } from "../Configuration";
import { DocumentNode, SectionNode } from "../documentation-domain";
import { getFilePathForApiItem } from "../utilities";
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
