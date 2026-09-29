/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NetworkError } from "@fluidframework/server-services-client";
import type { IDocumentManager, IDocumentRepository } from "@fluidframework/server-services-core";

/**
 * @internal
 */
export interface IDocumentDeleteService {
	deleteDocument(tenantId: string, documentId: string): Promise<void>;
}

export interface IDocumentStaticCacheInvalidator extends IDocumentManager {
	purgeStaticCache(tenantId: string, documentId: string, createTime?: number): Promise<void>;
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
		private readonly documentManager: IDocumentStaticCacheInvalidator,
		private readonly documentRepository: IDocumentRepository,
	) {}

	public async deleteDocument(tenantId: string, documentId: string): Promise<void> {
		if (this.documentDeleteService instanceof DocumentDeleteService) {
			return this.documentDeleteService.deleteDocument(tenantId, documentId);
		}
		const document = await this.documentRepository.readOne({ tenantId, documentId });
		await this.documentManager.purgeStaticCache(tenantId, documentId, document?.createTime);
		await this.documentDeleteService.deleteDocument(tenantId, documentId);
	}
}
