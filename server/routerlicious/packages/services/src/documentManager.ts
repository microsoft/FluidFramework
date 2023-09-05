/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScopeType } from "@fluidframework/protocol-definitions";
import { BasicRestWrapper } from "@fluidframework/server-services-client";
import { IDocumentManager, IDocument, ITenantManager, IDocumentStaticProperties } from "@fluidframework/server-services-core";
import { generateToken, getCorrelationId } from "@fluidframework/server-services-utils";
import { ICache } from "@fluidframework/server-services-core";
import { RedisCache } from "./redis";
import * as Redis from "ioredis";
import nconf from "nconf";

/**
 * Manager to fetch document from Alfred using the internal URL.
 */
export class DocumentManager implements IDocumentManager {
	private static documentStaticDataCache: ICache;

	constructor(
		private readonly internalAlfredUrl: string,
		private readonly tenantManager: ITenantManager,
	) {
		if (!DocumentManager.documentStaticDataCache) {
			const config: nconf.Provider = 
				nconf
					.argv()
					.env({ separator: "__", parseValues: true })
					.file("../../routerlicious/config.json")
					.use("memory");
			const redisConfig = config.get("redis");
			const redisClient = new Redis.default(redisConfig);
			DocumentManager.documentStaticDataCache = new RedisCache(redisClient);
		}
	}

	public async readDocument(tenantId: string, documentId: string): Promise<IDocument> {
		const restWrapper = await this.getBasicRestWrapper(tenantId, documentId);
		const document: IDocument = await restWrapper.get<IDocument>(`/documents/${tenantId}/${documentId}`);
		const staticProps: IDocumentStaticProperties = document;
		const staticPropsKey: string = DocumentManager.getDocumentStaticDataKeyHeader(documentId);
		DocumentManager.documentStaticDataCache.set(staticPropsKey, JSON.stringify(staticProps));
		return document;
	}

	public async readStaticData(tenantId: string, documentId: string): Promise<IDocumentStaticProperties> {
		const staticPropsKey: string = DocumentManager.getDocumentStaticDataKeyHeader(documentId);
		let staticPropsStr: string = await DocumentManager.documentStaticDataCache.get(staticPropsKey);

		// If there are no cached static data, read the document (will automatically cache the data)
		if (!staticPropsStr) {
			return this.readDocument(tenantId, documentId);
		}
		
		return JSON.parse(staticPropsStr);
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

	private static getDocumentStaticDataKeyHeader(documentId: string) {
		return `staticData:${documentId}`;
	}
}
