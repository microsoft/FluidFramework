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
	 * @param propName - The static property to be read
	 * @returns - The value of the property [propName]
	 */
	readStaticProperty<K extends keyof IDocumentStaticProperties>(
		tenantId: string,
		documentId: string,
		propName: K,
	): Promise<IDocumentStaticProperties[K] | undefined>;

	/**
	 * Modifies a static property for a specific document.
	 *
	 * @param documentId - The document ID for the document to be modified
	 * @param propName - The static property to be modified
	 * @param propValue - The new value for the static property
	 */
	setStaticProperty<K extends keyof IDocumentStaticProperties>(
		documentId: string,
		propName: K,
		propValue: IDocumentStaticProperties[K],
	): Promise<void>;

	/**
	 * Deletes the static cache for the specified document
	 *
	 * @param documentId - Document to delete from static cache
	 */
	purgeStaticCache(documentId: string): Promise<void>;
}
