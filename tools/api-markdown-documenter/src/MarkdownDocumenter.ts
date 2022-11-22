/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as Path from "node:path";

import { ApiItem } from "@microsoft/api-extractor-model";
import { StringBuilder } from "@microsoft/tsdoc";
import { FileSystem } from "@rushstack/node-core-library";

import {
    MarkdownDocumenterConfiguration,
    markdownDocumenterConfigurationWithDefaults,
} from "./Configuration";
import { MarkdownDocument } from "./MarkdownDocument";
import { MarkdownEmitter } from "./MarkdownEmitter";
import { renderApiItemDocument, renderModelDocument, renderPackageDocument } from "./rendering";
import { doesItemRequireOwnDocument, getLinkUrlForApiItem } from "./utilities";

/**
 * This module contains the primary rendering entrypoints to the system.
 *
 * @remarks
 * This implementation is based on API-Documenter's standard MarkdownDocumenter implementation,
 * but has been updated to be used programmatically rather than just from a CLI, and to be more extensible.
 *
 * The reference implementation can be found
 * {@link https://github.com/microsoft/rushstack/blob/main/apps/api-documenter/src/documenters/MarkdownDocumenter.ts
 * | here}.
 */

/**
 * Renders the provided model and its contents to a series of {@link MarkdownDocument}s.
 *
 * @remarks
 * Which API members get their own documents and which get written to the contents of their parent is
 * determined by {@link PolicyOptions.documentBoundaries}.
 *
 * @param partialConfig - A partial {@link MarkdownDocumenterConfiguration}.
 * Missing values will be filled in with defaults defined by {@link markdownDocumenterConfigurationWithDefaults}.
 */
export function renderDocuments(
    partialConfig: MarkdownDocumenterConfiguration,
): MarkdownDocument[] {
    const config = markdownDocumenterConfigurationWithDefaults(partialConfig);
    const apiModel = config.apiModel;

    console.log(`Rendering markdown documentation for API Model ${apiModel.displayName}...`);

    const documents: MarkdownDocument[] = [];

    // Always render Model document
    documents.push(renderModelDocument(apiModel, config));

    const filteredPackages = apiModel.packages.filter(
        (apiPackage) => !config.packageFilterPolicy(apiPackage),
    );
    if (filteredPackages.length > 0) {
        // For each package, walk the child graph to find API items which should be rendered to their own document
        // per provided policy.

        for (const packageItem of filteredPackages) {
            // Always render documents for packages under the model
            documents.push(renderPackageDocument(packageItem, config));

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
                documents.push(renderApiItemDocument(apiItem, config));
            }
        }
    }

    console.log("Documents rendered.");

    return documents;
}

/**
 * Renders the provided model and its contents, and writes each document to a file on disk.
 *
 * @remarks
 * Which API members get their own documents and which get written to the contents of their parent is
 * determined by {@link PolicyOptions.documentBoundaries}.
 *
 * The file paths under which the files will be saved is determined by the provided output path and the
 * following configuration properties:
 *
 * - {@link PolicyOptions.documentBoundaries}
 * - {@link PolicyOptions.hierarchyBoundaries}
 *
 * @param apiModel - The API model being processed.
 * This is the output of {@link https://api-extractor.com/ | API-Extractor}.
 * @param partialConfig - A partial {@link MarkdownDocumenterConfiguration}.
 * Missing values will be filled in with defaults defined by {@link markdownDocumenterConfigurationWithDefaults}.
 * @param markdownEmitter - The emitter to use for generating Markdown output.
 * If not provided, a {@link MarkdownEmitter | default implementation} will be used.
 */
export async function renderFiles(
    partialConfig: MarkdownDocumenterConfiguration,
    outputDirectoryPath: string,
    markdownEmitter?: MarkdownEmitter,
): Promise<void> {
    const config = markdownDocumenterConfigurationWithDefaults(partialConfig);

    await FileSystem.ensureEmptyFolderAsync(outputDirectoryPath);
    const resolvedMarkdownEmitter = markdownEmitter ?? new MarkdownEmitter(config.apiModel);

    const documents = renderDocuments(config);

    await Promise.all(
        documents.map(async (document) => {
            const emittedDocumentContents = resolvedMarkdownEmitter.emit(
                new StringBuilder(),
                document.contents,
                {
                    contextApiItem: document.apiItem,
                    getLinkUrlApiItem: (_apiItem) => getLinkUrlForApiItem(_apiItem, config),
                },
            );

            const filePath = Path.join(outputDirectoryPath, document.path);
            await FileSystem.writeFileAsync(filePath, emittedDocumentContents, {
                convertLineEndings: config.newlineKind,
                ensureFolderExists: true,
            });
        }),
    );
    console.log("Documents written to disk.");
}

/**
 * Walks the provided API item's member tree and reports all API items that should be rendered to their own documents.
 *
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
