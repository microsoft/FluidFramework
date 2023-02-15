import { ApiItem } from "@microsoft/api-extractor-model";

import { MarkdownDocumenterConfiguration } from "../../Configuration";
import { getFilePathForApiItem } from "../../utilities";
import { DocumentNode, SectionNode } from "../documentation-domain";
import { wrapInSection } from "./helpers";

/**
 * Helper function for creating a {@link DocumentNode} for an API item and its generated documentation contents.
 */
export function createDocument(
	apiItem: ApiItem,
	sections: SectionNode[],
	config: Required<MarkdownDocumenterConfiguration>,
): DocumentNode {
	const rootSection = wrapInSection(sections, { title: config.headingTitlePolicy(apiItem) });

	// TODO: front-matter, header, footer

	return new DocumentNode({
		children: [rootSection],
		filePath: getFilePathForApiItem(apiItem, config),
	});
}
