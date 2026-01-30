/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Constructs an ODSP blob content URL from the attachment endpoint and storage ID.
 *
 * @param attachmentGETStorageUrl - The base attachment GET URL from ODSP resolved URL endpoints
 * @param storageId - The blob storage ID
 * @returns The full URL to access the blob content
 *
 * @remarks
 * ODSP exposes the actual blob/file content stream by appending `/{storageId}/content`
 * to the attachment GET URL. The storage ID is URL-encoded to handle special characters.
 *
 * @internal
 */
export function buildOdspBlobContentUrl(
	attachmentGETStorageUrl: string,
	storageId: string,
): string {
	return `${attachmentGETStorageUrl}/${encodeURIComponent(storageId)}/content`;
}
