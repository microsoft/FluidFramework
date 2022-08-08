import { MarkdownEmitter } from "@microsoft/api-documenter/lib/markdown/MarkdownEmitter";
import { CustomDocNodes } from "@microsoft/api-documenter/lib/nodes/CustomDocNodeKind";
import { ApiItem, ApiModel } from "@microsoft/api-extractor-model";
import { StringBuilder, TSDocConfiguration } from "@microsoft/tsdoc";

import { MarkdownDocument } from "./Interfaces";
import {
    MarkdownDocumenterConfiguration,
    markdownDocumenterConfigurationWithDefaults,
} from "./MarkdownDocumenterConfiguration";
import { renderPageRootItem } from "./Rendering";
import { getQualifiedApiItemName } from "./Utilities";

// TODOs:
// - Document assumptions around file placements: flat list of package directories
// - `pick` types to make unit testing easier

/**
 * TODO
 *
 * @remarks
 * This implementation is based on API-Documenter's standard MarkdownDocumenter implementation,
 * but has been updated to be used programatically rather than just from a CLI, and to be more extensible.
 *
 * The reference implementation can be found
 * {@link https://github.com/microsoft/rushstack/blob/main/apps/api-documenter/src/documenters/MarkdownDocumenter.ts
 * | here}.
 */

/**
 * TODO
 * @param apiModel - TODO
 * @param partialDocumenterConfig - TODO
 * @param markdownEmitter - TODO
 */
export function render(
    apiModel: ApiModel,
    partialDocumenterConfig: MarkdownDocumenterConfiguration,
    markdownEmitter: MarkdownEmitter,
): MarkdownDocument[] {
    const documenterConfig = markdownDocumenterConfigurationWithDefaults(partialDocumenterConfig);
    const documentItems = getDocumentItems(apiModel, documenterConfig);

    const documents: MarkdownDocument[] = documentItems.map((documentItem) => {
        const renderedContents = renderPageRootItem(
            documentItem,
            documenterConfig,
            CustomDocNodes.configuration,
        );
        const emittedContents = markdownEmitter.emit(new StringBuilder(), renderedContents, {});
        return {
            contents: emittedContents,
            apiItemName: getQualifiedApiItemName(documentItem),
        };
    });
    return documents;
}

export async function renderFiles(
    apiModel: ApiModel,
    partialDocumenterConfig: MarkdownDocumenterConfiguration,
    tsdocConfiguration: TSDocConfiguration,
    markdownEmitter: MarkdownEmitter,
): Promise<void> {
    // TODO: clear out existing contents at location

    const documents = render(apiModel, partialDocumenterConfig, markdownEmitter);

    Promise.all(
        documents.map(async (document) => {
            // TODO: write each document to disc
        }),
    );
}

/**
 * Walks the provided API item's member tree and reports all API items that should be rendered to their own documents.
 * @param apiItem - The API item in question.
 * @param documentBoundaryPolicy - The policy defining which items should be rendered to their own documents,
 * and which should be rendered to their parent's document.
 */
export function getDocumentItems(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): ApiItem[] {
    const result: ApiItem[] = [];
    for (const member of apiItem.members) {
        if (config.documentBoundaryPolicy(member)) {
            result.push(member);
        }
        result.push(...getDocumentItems(member, config));
    }
    return result;
}
