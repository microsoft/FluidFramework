/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// TODO: Remove duplicate code in Historian
/*
 * Interface for a deny list. The goal is to deny requests for given tenantId, documentId
 * that have potential to cause service disruption.
 * That could happen, for example, due to very large summary sizes. While we should always
 * identify and fix causes that lead a document to get into such state, this is a protection
 * mechanism to avoid a DoS situation happening because of a few documents. E.g.: when documents
 * have accumulated very large summary sizes, they can cause Historian and/or GitRest to crash
 * due to OOM, especially given retries from the client and service (Scribe).
 */
export interface IDenyList {
	/**
	 * Checks if a given tenantId is denied.
	 */
	isTenantDenied(tenantId: string): boolean;

	/**
	 * Checks if a given documentId is denied.
	 */
	isDocumentDenied(documentId: string): boolean;
}
