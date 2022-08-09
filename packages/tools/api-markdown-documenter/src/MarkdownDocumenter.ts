import { MarkdownEmitter } from "@microsoft/api-documenter/lib/markdown/MarkdownEmitter";
import { CustomDocNodes } from "@microsoft/api-documenter/lib/nodes/CustomDocNodeKind";
import { ApiItem, ApiModel } from "@microsoft/api-extractor-model";
import { StringBuilder } from "@microsoft/tsdoc";
import { FileSystem } from "@rushstack/node-core-library";
import * as Path from "path";

import { MarkdownDocument } from "./MarkdownDocument";
import {
    MarkdownDocumenterConfiguration,
    markdownDocumenterConfigurationWithDefaults,
} from "./MarkdownDocumenterConfiguration";
import { renderPageRootItem } from "./Rendering";
import { getQualifiedApiItemName, getRelativeFilePathForApiItem } from "./utilities";

// TODOs:
// - Handle Model and Package level separately
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

    console.log(`Rendering markdown documentation for API Model ${apiModel.displayName}...`);

    const documentItems = getDocumentItems(apiModel, documenterConfig);

    if (documenterConfig.verbose) {
        console.log(
            `Identified ${documentItems.length} API items that will be rendered to their own documents per provided policy.`,
        );
    }

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
            path: getRelativeFilePathForApiItem(
                documentItem,
                documenterConfig,
                /* includeExtension: */ true,
            ),
        };
    });

    console.log("Documents rendered.");

    return documents;
}

export async function renderFiles(
    apiModel: ApiModel,
    outputDirectoryPath: string,
    partialDocumenterConfig: MarkdownDocumenterConfiguration,
    markdownEmitter: MarkdownEmitter,
): Promise<void> {
    await FileSystem.ensureEmptyFolderAsync(outputDirectoryPath);

    const documents = render(apiModel, partialDocumenterConfig, markdownEmitter);

    await Promise.all(
        documents.map(async (document) => {
            const filePath = Path.join(outputDirectoryPath, document.path);
            await FileSystem.writeFileAsync(filePath, document.contents, {
                convertLineEndings: partialDocumenterConfig.newlineKind,
                ensureFolderExists: true,
            });
        }),
    );
    console.log("Documents written to disk.");
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
