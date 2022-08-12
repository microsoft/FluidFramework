import { ApiItem } from "@microsoft/api-extractor-model";
import { FileSystem } from "@rushstack/node-core-library";
import * as Path from "path";

import { MarkdownDocument } from "./MarkdownDocument";
import {
    MarkdownDocumenterConfiguration,
    markdownDocumenterConfigurationWithDefaults,
} from "./MarkdownDocumenterConfiguration";
import { MarkdownEmitter } from "./MarkdownEmitter";
import { renderApiPage, renderModelPage, renderPackagePage } from "./rendering";
import { doesItemRequireOwnDocument } from "./utilities";

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
 * @param partialConfig - TODO
 * @param markdownEmitter - TODO
 */
export function renderDocuments(
    partialConfig: MarkdownDocumenterConfiguration,
    markdownEmitter: MarkdownEmitter,
): MarkdownDocument[] {
    const config = markdownDocumenterConfigurationWithDefaults(partialConfig);
    const apiModel = config.apiModel;

    console.log(`Rendering markdown documentation for API Model ${apiModel.displayName}...`);

    const documents: MarkdownDocument[] = [];

    // Always render Model page
    documents.push(renderModelPage(apiModel, config, markdownEmitter));

    if (apiModel.packages.length !== 0) {
        // For each package, walk the child graph to find API items which should be rendered to their own document page
        // per provided policy.

        for (const packageItem of apiModel.packages) {
            // Always render pages for packages under the model
            documents.push(renderPackagePage(packageItem, config, markdownEmitter));

            const packageEntryPoints = packageItem.entryPoints;
            if (packageEntryPoints.length !== 1) {
                throw new Error(
                    `Encountered multiple EntryPoint items under package "${packageItem.name}". ` +
                        "API-Extractor only supports single-entry packages, so this should not be possible.",
                );
            }

            const packageEntryPointItem = packageEntryPoints[0];

            const packageDocumentItems = getDocumentItems(packageEntryPointItem, config);
            for (const apiItem of packageDocumentItems) {
                documents.push(renderApiPage(apiItem, config, markdownEmitter));
            }
        }
    }

    console.log("Documents rendered.");

    return documents;
}

export async function renderFiles(
    partialConfig: MarkdownDocumenterConfiguration,
    outputDirectoryPath: string,
    markdownEmitter: MarkdownEmitter,
): Promise<void> {
    await FileSystem.ensureEmptyFolderAsync(outputDirectoryPath);

    const documents = renderDocuments(partialConfig, markdownEmitter);

    await Promise.all(
        documents.map(async (document) => {
            const filePath = Path.join(outputDirectoryPath, document.path);
            await FileSystem.writeFileAsync(filePath, document.contents, {
                convertLineEndings: partialConfig.newlineKind,
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
    for (const childItem of apiItem.members) {
        if (doesItemRequireOwnDocument(childItem, config.documentBoundaries)) {
            result.push(childItem);
        }
        result.push(...getDocumentItems(childItem, config));
    }
    return result;
}
