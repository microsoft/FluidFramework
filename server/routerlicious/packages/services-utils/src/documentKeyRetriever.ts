/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentManager } from "@fluidframework/server-services-core";
import { Lumberjack, getLumberBaseProperties } from "@fluidframework/server-services-telemetry";

export class DocumentKeyRetriever {
	public constructor(
		// TODO: Consolidate implementations of RedisCache class across all services, then change "any" type to Redis cache
		private readonly redis: any,
		private readonly documentManager: IDocumentManager,
		private readonly loggingEnabled: boolean = true,
	) {
		if (!redis) {
			throw new Error("Redis cache is undefined.");
		}
		if (!documentManager) {
			throw new Error("Document manager is undefined.");
		}
	}

	public async getKeyCosmos<ValType>(
		keyName: string,
		tenantId: string,
		documentId: string,
		useCachedDocument: boolean = true,
	): Promise<ValType> {
		this.infoLog(`Retrieving value of ${keyName} from cosmosDB.`, documentId, tenantId);

		// Retrieve the cached document details, if it exists for this document
		const cachedDetails: Record<string, any> | undefined = useCachedDocument
			? await this.getCachedDocumentDetails(documentId)
			: undefined;

		let val: ValType = cachedDetails?.[keyName];
		if (val) {
			// If the cached document details contain the key and useCachedDocument is true, use the cached value
			this.infoLog("Using cached cosmosDB document details.", documentId, tenantId);
		} else {
			// Otherwise, call cosmosDB, and cache the result
			this.infoLog("Querying cosmosDB and caching the results.", documentId, tenantId);
			const documentDetails: Record<string, any> = await this.documentManager.readDocument(
				tenantId,
				documentId,
			);
			await this.setCachedDocumentDetails(documentId, documentDetails);
			val = documentDetails?.[keyName];
		}

		return val;
	}

	public async getKeyRedis<ValType>(keyName: string): Promise<ValType> {
		this.infoLog(`Retrieving value of ${keyName} from redis`);
		const val: ValType = await this.redis.get(keyName);
		return val;
	}

	public async getKeyRedisFallback<ValType>(
		keyNameBase: string,
		tenantId: string,
		documentId: string,
		useCachedDocument: boolean = true,
	): Promise<ValType> {
		const redisKeyName: string = `${keyNameBase}:${documentId}}`;
		const cosmosKeyName: string = keyNameBase;

		let val: ValType = await this.getKeyRedis<ValType>(redisKeyName);
		if (val !== undefined && val !== null) {
			// Return the value if redis has it
			this.infoLog(`Found value for ${redisKeyName} in redis.`, documentId, tenantId);
			return val;
		} else {
			// Otherwise, get the value from cosmos and cache the result in redis
			this.infoLog(
				`Could not find value for ${redisKeyName} in redis. Falling back to cosmosDB for keyname ${cosmosKeyName}.`,
				documentId,
				tenantId,
			);

			val = await this.getKeyCosmos<ValType>(
				cosmosKeyName,
				tenantId,
				documentId,
				useCachedDocument,
			);
			await this.redis.set(redisKeyName, val);
			return val;
		}
	}

	public async getCachedDocumentDetails(
		documentId: string,
	): Promise<Record<string, any> | undefined> {
		// Check if redis has a cache of cosmosDB document details
		const documentDetailsKey: string = DocumentKeyRetriever.getDocumentDetailsKey(documentId);
		const documentDetails: any = await this.redis.get(documentDetailsKey);
		if (documentDetails) {
			return documentDetails as Record<string, any> | undefined;
		}
		return undefined;
	}

	public async setCachedDocumentDetails(
		documentId: string,
		documentDetails: Record<string, any>,
	): Promise<void> {
		// Set the redis cache for cosmosDB document details
		await this.redis.set(
			DocumentKeyRetriever.getDocumentDetailsKey(documentId),
			documentDetails,
		);
	}

	private static getDocumentDetailsKey(documentId: string): string {
		return `documentDetails:${documentId}`;
	}

	private infoLog(message: string, documentId?: string, tenantId?: string) {
		if (this.loggingEnabled) {
			documentId && tenantId
				? Lumberjack.info(message, getLumberBaseProperties(documentId, tenantId))
				: Lumberjack.info(message);
		}
	}
}
