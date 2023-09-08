/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScopeType } from "@fluidframework/protocol-definitions";
import { BasicRestWrapper } from "@fluidframework/server-services-client";
import {
	IDocumentManager,
	IDocument,
	ITenantManager,
	IDocumentStaticProperties,
	ICache,
} from "@fluidframework/server-services-core";
import { generateToken, getCorrelationId } from "@fluidframework/server-services-utils";
import * as Redis from "ioredis";
import { Lumberjack, getLumberBaseProperties } from "@fluidframework/server-services-telemetry";
import { RedisCache } from "./redis";

/**
 * Manager to fetch document from Alfred using the internal URL.
 */
export class DocumentManager implements IDocumentManager {
	private static documentStaticDataCache: ICache;
	/** True if the cache was initialized by setStaticProperty. Becomes false if the cache is overwritten by readDocument. */
	private static staticCacheInitializedManually: boolean;

	constructor(
		private readonly internalAlfredUrl: string,
		private readonly tenantManager: ITenantManager,
	) {
		// TODO: Eventually replace the static documentStaticDataCache field with a passed in optional value, to not have to initialize it here
		// This can be done once the unified RedisCache/ICache implementation is made, the issue right now is that different RedisCache objects
		// could be passed in, which would mean different headers and therefore multiple static document caches could exist at once.
		// The unified RedisCache implementation will have more flexibility around headers, which will help fix this issue.

		// If a redis cache does not yet exist, create one to populate the static field
		if (!DocumentManager.documentStaticDataCache) {
			const redisConfig: Redis.RedisOptions = {
				host: "redis",
				port: 6379,
			};
			const redisClient = new Redis.default(redisConfig);
			DocumentManager.documentStaticDataCache = new RedisCache(redisClient);
		}
		if (!DocumentManager.staticCacheInitializedManually) {
			DocumentManager.staticCacheInitializedManually = false;
		}
	}

	public async readDocument(tenantId: string, documentId: string): Promise<IDocument> {
		// Retrieve the document
		const restWrapper = await this.getBasicRestWrapper(tenantId, documentId);
		const document: IDocument = await restWrapper.get<IDocument>(
			`/documents/${tenantId}/${documentId}`,
		);
		if (!document) {
			return undefined;
		}
		const staticProps: IDocumentStaticProperties =
			DocumentManager.getStaticPropsFromDoc(document);

		// Cache the static properties of the document
		DocumentManager.staticCacheInitializedManually = false;
		const staticPropsKey: string = DocumentManager.getDocumentStaticKey(documentId);
		await DocumentManager.documentStaticDataCache.set(
			staticPropsKey,
			JSON.stringify(staticProps),
		);

		// Return the original document that was retrieved
		return document;
	}

	public async readStaticProperty<T>(
		tenantId: string,
		documentId: string,
		propName: string,
	): Promise<T | undefined> {
		// Retrieve cached static document props
		const staticPropsKey: string = DocumentManager.getDocumentStaticKey(documentId);
		const staticPropsStr: string = await DocumentManager.documentStaticDataCache.get(
			staticPropsKey,
		);
		const staticProps: IDocumentStaticProperties = JSON.parse(
			staticPropsStr,
		) as IDocumentStaticProperties;

		// If there are no cached static document props, or we need to overwrite an manually initialized cache,
		// read the document and return its static properties
		const overwriteManualCache: boolean =
			DocumentManager.staticCacheInitializedManually && staticProps[propName] === undefined;
		if (!staticPropsStr || overwriteManualCache) {
			Lumberjack.info(
				"Falling back to database after attempting to read cached static document data. ",
				getLumberBaseProperties(documentId, tenantId),
			);
			const document: IDocument = await this.readDocument(tenantId, documentId);
			return document?.[propName] as T | undefined;
		}

		// Return the static data, parsed into a JSON object
		return staticProps[propName] as T | undefined;
	}

	public async setStaticProperty<T>(
		documentId: string,
		propName: string,
		propValue: T,
	): Promise<void> {
		// Retrieve the current static cache
		const staticPropsKey: string = DocumentManager.getDocumentStaticKey(documentId);
		const staticPropsStr: string = await DocumentManager.documentStaticDataCache.get(
			staticPropsKey,
		);
		let staticProps: IDocumentStaticProperties;

		if (!staticPropsStr) {
			// If the static properties do not exist, create a new empty object
			staticProps = DocumentManager.createEmptyStaticProps();
			DocumentManager.staticCacheInitializedManually = true;
			Lumberjack.info(`Empty Static Props: ${JSON.stringify(staticProps)}`);
		} else {
			// Otherwise, use the existing static props
			staticProps = JSON.parse(staticPropsStr);
		}

		// Modify the specified property, and set the new value in the cache
		staticProps[propName] = propValue;
		Lumberjack.info(`Static Props: ${JSON.stringify(staticProps)}`);
		await DocumentManager.documentStaticDataCache.set(
			staticPropsKey,
			JSON.stringify(staticProps),
		);
	}

	private async getBasicRestWrapper(tenantId: string, documentId: string) {
		const key = await this.tenantManager.getKey(tenantId);
		const getDefaultHeaders = () => {
			const jwtToken = generateToken(tenantId, documentId, key, [ScopeType.DocRead]);
			return {
				Authorization: `Basic ${jwtToken}`,
			};
		};

		const restWrapper = new BasicRestWrapper(
			this.internalAlfredUrl,
			undefined /* defaultQueryString */,
			undefined /* maxBodyLength */,
			undefined /* maxContentLength */,
			getDefaultHeaders(),
			undefined /* Axios */,
			undefined /* refreshDefaultQueryString */,
			getDefaultHeaders /* refreshDefaultHeaders */,
			getCorrelationId /* getCorrelationId */,
		);
		return restWrapper;
	}

	/**
	 * Creates a cache key to retreive static data from a document
	 *
	 * @param documentId - ID of the document to create an access key for
	 * @returns - A cache key to access static data for [documentId]
	 */
	private static getDocumentStaticKey(documentId: string): string {
		return `staticData:${documentId}`;
	}

	/**
	 * Extracts the static properties from an IDocument
	 *
	 * @param document - Document to get properties from
	 * @returns - The static properties of [document]
	 */
	private static getStaticPropsFromDoc(document: IDocument): IDocumentStaticProperties {
		return {
			version: document.version,
			createTime: document.createTime,
			documentId: document.documentId,
			tenantId: document.tenantId,
			storageName: document.storageName,
			isEphemeralContainer: document.isEphemeralContainer,
		};
	}

	/**
	 * Creates an empty IDocumentStaticProperties object
	 *
	 * @returns - an empty IDocumentStaticProperties object
	 */
	private static createEmptyStaticProps(): IDocumentStaticProperties {
		return {
			version: undefined,
			createTime: undefined,
			documentId: undefined,
			tenantId: undefined,
			storageName: undefined,
			isEphemeralContainer: undefined,
		};
	}
}
