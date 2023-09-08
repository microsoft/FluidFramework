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
	}

	public async readDocument(tenantId: string, documentId: string): Promise<IDocument> {
		// Retrieve the document
		const restWrapper = await this.getBasicRestWrapper(tenantId, documentId);
		const document: IDocument = await restWrapper.get<IDocument>(
			`/documents/${tenantId}/${documentId}`,
		);
		const staticProps: IDocumentStaticProperties =
			DocumentManager.getStaticPropsFromDoc(document);

		// Cache the static properties of the document
		const staticPropsKey: string = DocumentManager.getDocumentStaticKey(documentId);
		await DocumentManager.documentStaticDataCache.set(
			staticPropsKey,
			JSON.stringify(staticProps),
		);

		// Return the original document that was retrieved
		return document;
	}

	public async readStaticData(
		tenantId: string,
		documentId: string,
	): Promise<IDocumentStaticProperties> {
		// Retrieve cached static document props
		const staticPropsKey: string = DocumentManager.getDocumentStaticKey(documentId);
		const staticPropsStr: string = await DocumentManager.documentStaticDataCache.get(
			staticPropsKey,
		);

		// If there are no cached static document props, read the document and return its static properties
		if (!staticPropsStr) {
			Lumberjack.info(
				"Falling back to database after attempting to read cached static document data. ",
				getLumberBaseProperties(documentId, tenantId),
			);
			const document: IDocument = await this.readDocument(tenantId, documentId);
			return DocumentManager.getStaticPropsFromDoc(document);
		}

		// Return the static data, parsed into a JSON object
		const staticProps: IDocumentStaticProperties = JSON.parse(
			staticPropsStr,
		) as IDocumentStaticProperties;
		return staticProps;
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
}
