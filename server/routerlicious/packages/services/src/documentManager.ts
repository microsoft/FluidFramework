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
	// private static documentStaticDataCache: ICache;
	/** True if the cache was initialized by setStaticProperty. Becomes false if the cache is overwritten by readDocument. */
	private static staticCacheInitializedManually: boolean;

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

		if (this.documentStaticDataCache) {
			// Cache the static properties of the document
			DocumentManager.staticCacheInitializedManually = false;
			const staticPropsKey: string = DocumentManager.getDocumentStaticKey(documentId);
			await this.documentStaticDataCache.set(staticPropsKey, JSON.stringify(staticProps));
		}

		// Return the original document that was retrieved
		return document;
	}

	public async readStaticProperty<K extends keyof IDocumentStaticProperties>(
		tenantId: string,
		documentId: string,
		propName: K,
	): Promise<IDocumentStaticProperties[K] | undefined> {
		// If the cache is undefined, just read the document normally
		if (!this.documentStaticDataCache) {
			const document: IDocument = await this.readDocument(tenantId, documentId);
			return document?.[propName] as IDocumentStaticProperties[K] | undefined;
		}

		// Retrieve cached static document props
		const staticPropsKey: string = DocumentManager.getDocumentStaticKey(documentId);
		const staticPropsStr: string = await this.documentStaticDataCache.get(staticPropsKey);
		const staticProps: IDocumentStaticProperties = JSON.parse(
			staticPropsStr,
		) as IDocumentStaticProperties;

		// If there are no cached static document props, or we need to overwrite an manually initialized cache,
		// read the document and return its static properties
		const overwriteManualCache: boolean =
			DocumentManager.staticCacheInitializedManually && staticProps?.[propName] === undefined;
		if (!staticPropsStr || overwriteManualCache) {
			Lumberjack.info(
				"Falling back to database after attempting to read cached static document data. ",
				getLumberBaseProperties(documentId, tenantId),
			);
			const document: IDocument = await this.readDocument(tenantId, documentId);
			return document?.[propName] as IDocumentStaticProperties[K] | undefined;
		}

		// Return the static data, parsed into a JSON object
		return staticProps[propName];
	}

	public async setStaticProperty<K extends keyof IDocumentStaticProperties>(
		documentId: string,
		propName: K,
		propValue: IDocumentStaticProperties[K],
	): Promise<void> {
		// If the cache is undefined, do nothing, because there are no cached static properties to change
		if (!this.documentStaticDataCache) {
			Lumberjack.error(
				"Cannot set document static property because the DocumentManager cache is undefined",
			);
			return;
		}

		// Retrieve the current static cache
		const staticPropsKey: string = DocumentManager.getDocumentStaticKey(documentId);
		const staticPropsStr: string = await this.documentStaticDataCache.get(staticPropsKey);
		let staticProps: IDocumentStaticProperties;

		if (!staticPropsStr) {
			// If the static properties do not exist, create a new empty object
			staticProps = DocumentManager.createEmptyStaticProps();
			DocumentManager.staticCacheInitializedManually = true;
		} else {
			// Otherwise, use the existing static props
			staticProps = JSON.parse(staticPropsStr);
		}

		// Modify the specified property, and set the new value in the cache
		staticProps[propName] = propValue;
		await this.documentStaticDataCache.set(staticPropsKey, JSON.stringify(staticProps));
	}

	public async purgeStaticCache(documentId: string): Promise<void> {
		// If the cache is undefined, do nothing, because there are no cached static properties to purge
		if (!this.documentStaticDataCache) {
			Lumberjack.error(
				"Cannot set document static property because the DocumentManager cache is undefined",
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
