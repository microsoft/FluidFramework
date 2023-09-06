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
import { Lumberjack } from "@fluidframework/server-services-telemetry";
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
		if (!DocumentManager.documentStaticDataCache) {
			// const config: nconf.Provider = nconf
			// 	.argv()
			// 	.env({ separator: "__", parseValues: true })
			// 	.file(path.join(__dirname, "../../routerlicious/config/config.json"))
			// 	.use("memory");
			// Lumberjack.info(`Config: ${JSON.stringify(config)}`);
			const redisConfig: Redis.RedisOptions = {
				host: "redis",
				port: 6379,
				// tls: {
				// 	servername: "redis",
				// },
				// connectTimeout: 10000,
				// maxRetriesPerRequest: 20,
				// enableAutoPipelining: false,
				// enableOfflineQueue: true,
			};
			// config.get("redis");
			Lumberjack.info(`redis config: ${JSON.stringify(redisConfig)}`);
			const redisClient = new Redis.default(redisConfig);
			DocumentManager.documentStaticDataCache = new RedisCache(redisClient);
		}
	}

	public async readDocument(tenantId: string, documentId: string): Promise<IDocument> {
		const restWrapper = await this.getBasicRestWrapper(tenantId, documentId);
		const document: IDocument = await restWrapper.get<IDocument>(
			`/documents/${tenantId}/${documentId}`,
		);
		Lumberjack.info(`Document: ${JSON.stringify(document)}`);

		const staticProps: IDocumentStaticProperties = {
			version: document.version,
			createTime: document.createTime,
			documentId: document.documentId,
			tenantId: document.tenantId,
			isEphemeralContainer: document.isEphemeralContainer,
		};

		// const staticProps: IDocumentStaticProperties = document;
		Lumberjack.info(`Static doc: ${JSON.stringify(staticProps)}`);
		const staticPropsKey: string = DocumentManager.getDocumentStaticDataKeyHeader(documentId);
		Lumberjack.info(`Setting key ${staticPropsKey} to ${JSON.stringify(staticProps)}`);
		await DocumentManager.documentStaticDataCache.set(
			staticPropsKey,
			JSON.stringify(staticProps),
		);
		return document;
	}

	public async readStaticData(
		tenantId: string,
		documentId: string,
	): Promise<IDocumentStaticProperties> {
		const staticPropsKey: string = DocumentManager.getDocumentStaticDataKeyHeader(documentId);
		Lumberjack.info("### Attempting to read document from cached ###");
		const staticPropsStr: string = await DocumentManager.documentStaticDataCache.get(
			staticPropsKey,
		);
		Lumberjack.info(`### Read document from cached ${staticPropsStr} ###`);

		// If there are no cached static data, read the document (will automatically cache the data)
		if (!staticPropsStr) {
			Lumberjack.info("### Reading document from cosmosDB ###");
			return this.readDocument(tenantId, documentId);
		}
		const staticProps: IDocumentStaticProperties = JSON.parse(
			staticPropsStr,
		) as IDocumentStaticProperties;

		Lumberjack.info("### Reading document from cached ###");
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

	private static getDocumentStaticDataKeyHeader(documentId: string) {
		return `staticData:${documentId}`;
	}
}
