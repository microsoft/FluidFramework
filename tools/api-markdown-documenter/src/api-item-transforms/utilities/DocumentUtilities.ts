/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ApiItem } from "@microsoft/api-extractor-model";

import type { ApiDocument } from "../../ApiDocument.js";
import { normalizeDocumentContents, type Section } from "../../mdast/index.js";
import type { ApiItemTransformationConfiguration } from "../configuration/index.js";

import { getDocumentPathForApiItem } from "./ApiItemTransformUtilities.js";

/**
 * Creates a {@link ApiDocument} representing the provided API item.
 *
 * @param documentItem - The API item to be documented.
 * @param sections - An array of sections to be included in the document.
 * @param config - The transformation configuration for the API item.
 *
 * @returns A {@link ApiDocument} representing the constructed document.
 */
export function createDocument(
	documentItem: ApiItem,
	sections: Section[],
	config: ApiItemTransformationConfiguration,
): ApiDocument {
	const title = config.getHeadingTextForItem(documentItem);

	// Wrap sections in a root section if top-level heading is requested.
	const contents: Section[] = config.includeTopLevelDocumentHeading
		? [
				{
					type: "section",
					children: sections,
					heading: {
						type: "sectionHeading",
						title,
					},
				},
			]
		: sections;

	const normalizedContents = normalizeDocumentContents(contents, {
		startingHeadingLevel: config.startingHeadingLevel,
	});

	return {
		apiItem: documentItem,
		contents: normalizedContents,
		documentPath: getDocumentPathForApiItem(documentItem, config.hierarchy),
	};
}

/**
 * Checks for duplicate {@link ApiDocument.documentPath}s among the provided set of documents.
 * @throws If any duplicates are found.
 */
export function checkForDuplicateDocumentPaths(documents: readonly ApiDocument[]): void {
	const documentPathMap = new Map<string, ApiDocument[]>();
	for (const document of documents) {
		let entries = documentPathMap.get(document.documentPath);
		if (entries === undefined) {
			entries = [];
			documentPathMap.set(document.documentPath, entries);
		}
		entries.push(document);
	}

	const duplicates = [...documentPathMap.entries()].filter(
		([, documentsUnderPath]) => documentsUnderPath.length > 1,
	);

	if (duplicates.length === 0) {
		return;
	}

	const errorMessageLines = ["Duplicate output paths found among the generated documents:"];

	for (const [documentPath, documentsUnderPath] of duplicates) {
		errorMessageLines.push(`- ${documentPath}`);
		for (const document of documentsUnderPath) {
			const errorEntry = `${document.apiItem.displayName} (${document.apiItem.kind})`;
			errorMessageLines.push(`  - ${errorEntry}`);
		}
	}
	errorMessageLines.push(
		"Check your configuration to ensure different API items do not result in the same output path.",
	);

	throw new Error(errorMessageLines.join("\n"));
}
