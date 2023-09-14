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
import { Lumberjack, getLumberBaseProperties } from "@fluidframework/server-services-telemetry";

/**
 * Manager to fetch document from Alfred using the internal URL.
 */
export class DocumentManager implements IDocumentManager {
	constructor(
		private readonly internalAlfredUrl: string,
		private readonly tenantManager: ITenantManager,
		private readonly documentStaticDataCache?: ICache,
	) {
		if (!this.documentStaticDataCache) {
			Lumberjack.info(
				"DocumentManager static data cache is undefined, cache will not be used.",
			);
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

		if (this.documentStaticDataCache) {
			// Cache the static properties of the document
			const staticProps: IDocumentStaticProperties =
				DocumentManager.getStaticPropsFromDoc(document);
			const staticPropsKey: string = DocumentManager.getDocumentStaticKey(documentId);
			await this.documentStaticDataCache.set<string>(
				staticPropsKey,
				JSON.stringify(staticProps),
			);
		}

		// Return the original document that was retrieved
		return document;
	}

	public async readStaticProperties(
		tenantId: string,
		documentId: string,
	): Promise<IDocumentStaticProperties | undefined> {
		// If the cache is undefined, fetch the document from the database
		if (!this.documentStaticDataCache) {
			Lumberjack.info(
				"Falling back to database after attempting to read cached static document data, because the DocumentManager cache is undefined.",
				getLumberBaseProperties(documentId, tenantId),
			);
			const document: IDocument = await this.readDocument(tenantId, documentId);
			return document as IDocumentStaticProperties | undefined;
		}

		// Retrieve cached static document props
		const staticPropsKey: string = DocumentManager.getDocumentStaticKey(documentId);
		const staticPropsStr: string = await this.documentStaticDataCache.get<string>(
			staticPropsKey,
		);

		// If there are no cached static document props, fetch the document from the database
		if (!staticPropsStr) {
			Lumberjack.info(
				"Falling back to database after attempting to read cached static document data.",
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

	public async purgeStaticCache(documentId: string): Promise<void> {
		// If the cache is undefined, do nothing, because there are no cached static properties to purge
		if (!this.documentStaticDataCache) {
			Lumberjack.error(
				"Cannot purge document static properties cache, because the DocumentManager cache is undefined.",
			);
			return;
		}

		const staticPropsKey: string = DocumentManager.getDocumentStaticKey(documentId);
		await this.documentStaticDataCache.delete(staticPropsKey);
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
