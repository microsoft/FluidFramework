/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IStorageNameAllocator {
	assign(tenantId: string, documentId: string): Promise<string>;
}
