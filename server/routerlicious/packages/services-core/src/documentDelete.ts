/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IDocumentDeleteService {
	deleteDocument(tenantId: string, documentId: string): Promise<void>;
}
