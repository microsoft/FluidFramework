/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocument, IDocumentStaticProperties } from "./document";

/**
 * @internal
 */
export interface IDocumentManager {
	/**
	 * Reads the data from a specific document, in the form of an IDocument object
	 *
	 * @param tenantId - The tenant ID for the tenant that owns the document
	 * @param documentId - The document ID for the document to be read
	 * @returns - An IDocument object containing properties with the document's data
	 */
	// eslint-disable-next-line @rushstack/no-new-null
	readDocument(tenantId: string, documentId: string): Promise<IDocument | null>;

	/**
	 * Reads only the static data for a specific document, using a cache of the data to do so potentially faster than readDocument.
	 * The static data for the document is never expected to change throughout the document's lifespan.
	 *
	 * @param tenantId - The tenant ID for the tenant that owns the document
	 * @param documentId - The document ID for the document to be read
	 * @returns - The static properties of the document
	 */
	readStaticProperties(
		tenantId: string,
		documentId: string,
	): Promise<IDocumentStaticProperties | undefined>;

	/**
	 * Deletes the static cache for the specified document
	 *
	 * @param documentId - Document to delete from static cache
	 */
	purgeStaticCache(documentId: string): Promise<void>;
}
