/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NetworkError } from "@fluidframework/server-services-client";
import type {
	ICache,
	IDocumentManager,
	IDocumentRepository,
} from "@fluidframework/server-services-core";

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
		private readonly documentDeletionMarkerCache: ICache,
	) {}

	public async deleteDocument(tenantId: string, documentId: string): Promise<void> {
		const document = await this.documentRepository.readOne({ tenantId, documentId });
		await this.documentManager.purgeStaticCache(tenantId, documentId, document?.createTime);
		try {
			await this.documentDeleteService.deleteDocument(tenantId, documentId);
		} catch (error) {
			if (
				this.documentDeleteService instanceof DocumentDeleteService &&
				error instanceof NetworkError &&
				error.code === 501
			) {
				await this.documentDeletionMarkerCache.delete?.(
					`deletedDocument:${encodeURIComponent(tenantId)}:${encodeURIComponent(
						documentId,
					)}`,
				);
			}
			throw error;
		}
	}
}
