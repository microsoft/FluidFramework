/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @internal
 */
export interface IStorageNameRetriever {
	get(tenantId: string, documentId: string): Promise<string>;
}
