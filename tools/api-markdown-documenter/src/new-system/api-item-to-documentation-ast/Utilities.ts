import { ApiItem } from "@microsoft/api-extractor-model";

import { MarkdownDocumenterConfiguration } from "../../Configuration";
import { getFilePathForApiItem } from "../../utilities";
import { DocumentNode, DocumentationNode } from "../documentation-domain";

/**
 * Helper function for creating a {@link DocumentNode} for an API item and its generated documentation contents.
 */
export function createDocument(
    apiItem: ApiItem,
    contents: DocumentationNode[],
    config: Required<MarkdownDocumenterConfiguration>,
): DocumentNode {
    // TODO: front-matter, header, footer
    return new DocumentNode(
        contents,
        getFilePathForApiItem(apiItem, config, /* includeExtension: */ true),
        config.includeTopLevelDocumentHeading ? config.headingTitlePolicy(apiItem) : undefined,
    );
}
