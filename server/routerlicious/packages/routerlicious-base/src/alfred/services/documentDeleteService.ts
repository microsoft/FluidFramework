/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NetworkError } from "@fluidframework/server-services-client";
import type { IDocumentManager } from "@fluidframework/server-services-core";

/**
 * @internal
 */
export interface IDocumentDeleteService {
	deleteDocument(tenantId: string, documentId: string): Promise<void>;
}

/**
 * @internal
 */
export class DocumentDeleteService implements IDocumentDeleteService {
	constructor() {}

	public async deleteDocument(tenantId: string, documentId: string): Promise<void> {
		throw new NetworkError(
			501,
			"Document delete service is not implemented.",
			false /* canRetry */,
		);
	}
}

export class DocumentDeleteServiceWithCacheInvalidation implements IDocumentDeleteService {
	public constructor(
		private readonly documentDeleteService: IDocumentDeleteService,
		private readonly documentManager: IDocumentManager,
	) {}

	public async deleteDocument(tenantId: string, documentId: string): Promise<void> {
		await this.documentManager.purgeStaticCache(tenantId, documentId);
		await this.documentDeleteService.deleteDocument(tenantId, documentId);
	}
}
