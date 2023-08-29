/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentManager } from "@fluidframework/server-services-core";
import { Lumberjack } from "@fluidframework/server-services-telemetry";

export class DocumentKeyRetriever {
	public constructor(
		/* The type of the redis variable is currently set to "any," which is not ideal. The reason for this
		 * is that there is currently a different RedisCache and ICache implementation for Routerlicious, Gitrest, and Historian, which all differ slightly.
		 * The RedisCache intented to be passed into this constructor is the one from Historian, however I am not able to import Historian's ICache or RedisCache into r11s.
		 * Using r11s' ICache also doesn't work because it has different return types than the Historian ICache, which has templated outputs/inputs for cache.get and cache.set.
		 *
		 * Here is what I propose:
		 * 1. We leave it as type "any" for now
		 * 2. During Microsoft's FHL week (September 11-15), I will work on refactoring RedisCache such that Routerlicious, Gitrest, and Historian will all use the same ICache/RedisCache (with the prefix being passed into the constructor)
		 */
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
		useCosmosCache: boolean = true,
	): Promise<ValType> {
		this.infoLog(
			`Retrieving value of ${keyName} from cosmosDB for tenant ${tenantId} and document ${documentId}.`,
		);

		// Retrieve the cached document details, if it exists for this document
		const cachedDetails: Record<string, any> | undefined = await this.getCachedDocumentDetails(
			documentId,
		);

		let val: ValType = cachedDetails?.[keyName];
		if (useCosmosCache && val) {
			// If the cached document details contain the key and useCosmosCache is true, use the cached value
			this.infoLog("Using cached cosmosDB document details.");
		} else {
			// Otherwise, call cosmosDB, and cache the result
			this.infoLog("Querying cosmosDB and caching the results.");
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
		redisKeyName: string,
		cosmosKeyName: string,
		tenantId: string,
		documentId: string,
		useCosmosCache: boolean = true,
	): Promise<ValType> {
		let val: ValType = await this.getKeyRedis<ValType>(redisKeyName);
		if (val !== undefined && val !== null) {
			// Return the value if redis has it
			this.infoLog(`Found value for ${redisKeyName} in redis.`);
			return val;
		} else {
			// Otherwise, get the value from cosmos and cache the result in redis
			this.infoLog(
				`Could not find value for ${redisKeyName} in redis. Falling back to cosmosDB for keyname ${cosmosKeyName}.`,
			);

			val = await this.getKeyCosmos<ValType>(
				cosmosKeyName,
				tenantId,
				documentId,
				useCosmosCache,
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

	private infoLog(message: string) {
		if (this.loggingEnabled) {
			Lumberjack.info(message);
		}
	}
}
