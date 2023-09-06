/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocument, IDocumentStaticProperties } from "./document";

export interface IDocumentManager {
	/**
	 * Reads the data from a specific document, in the form of an IDocument object
	 *
	 * @param tenantId - The tenant ID for the tenant that owns the document
	 * @param documentId - The document ID for the document to be read
	 * @returns - An IDocument object containing properties with the document's data
	 */
	readDocument(tenantId: string, documentId: string): Promise<IDocument>;

	/**
	 * Reads only the static data for a specific document, using a cache of the data to do so potentially faster than readDocument.
	 * The static data for the document is never expected to change throughout the document's lifespan.
	 *
	 * @param tenantId - The tenant ID for the tenant that owns the document
	 * @param documentId - The document ID for the document to be read
	 * @returns - An IDocumentStaticProperties object containing properties with the document's static data
	 */
	readStaticData(tenantId: string, documentId: string): Promise<IDocumentStaticProperties>;
}
