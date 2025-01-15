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
import {
	Lumberjack,
	getLumberBaseProperties,
	getGlobalTelemetryContext,
} from "@fluidframework/server-services-telemetry";
import { extractTokenFromHeader, getValidAccessToken } from "@fluidframework/server-services-utils";
import type { RawAxiosRequestHeaders } from "axios";

/**
 * Manager to fetch document from Alfred using the internal URL.
 * @internal
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

	// eslint-disable-next-line @rushstack/no-new-null
	public async readDocument(tenantId: string, documentId: string): Promise<IDocument | null> {
		// Retrieve the document
		const restWrapper = await this.getBasicRestWrapper(tenantId, documentId);
		const document: IDocument = await restWrapper.get<IDocument>(
			`/documents/${tenantId}/${documentId}`,
		);
		if (!document) {
			return null;
		}

		if (this.documentStaticDataCache) {
			// Cache the static properties of the document
			const staticProps: IDocumentStaticProperties =
				DocumentManager.getStaticPropsFromDoc(document);
			const staticPropsKey: string = DocumentManager.getDocumentStaticKey(documentId);
			await this.documentStaticDataCache.set(staticPropsKey, JSON.stringify(staticProps));
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
			Lumberjack.verbose(
				"Falling back to database after attempting to read cached static document data, because the DocumentManager cache is undefined.",
				getLumberBaseProperties(documentId, tenantId),
			);
			const document = (await this.readDocument(tenantId, documentId)) ?? undefined;
			return document as IDocumentStaticProperties | undefined;
		}

		// Retrieve cached static document props
		const staticPropsKey: string = DocumentManager.getDocumentStaticKey(documentId);
		const staticPropsStr: string | undefined =
			(await this.documentStaticDataCache.get(staticPropsKey)) ?? undefined;

		// If there are no cached static document props, fetch the document from the database
		if (!staticPropsStr) {
			Lumberjack.verbose(
				"Falling back to database after attempting to read cached static document data.",
				getLumberBaseProperties(documentId, tenantId),
			);
			const document = await this.readDocument(tenantId, documentId);
			if (!document) {
				Lumberjack.warning(
					"Fallback to database failed, document not found.",
					getLumberBaseProperties(documentId, tenantId),
				);
				return undefined;
			}
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
		if (this.documentStaticDataCache.delete === undefined) {
			Lumberjack.error(
				"Cannot purge document static properties cache, because the cache does not have a delete function.",
			);
			return;
		}

		const staticPropsKey: string = DocumentManager.getDocumentStaticKey(documentId);
		await this.documentStaticDataCache.delete(staticPropsKey);
	}

	private async getBasicRestWrapper(tenantId: string, documentId: string) {
		const scopes = [ScopeType.DocRead];
		const accessToken = await this.tenantManager.signToken(tenantId, documentId, scopes);
		const getDefaultHeaders = () => {
			return {
				Authorization: `Basic ${accessToken}`,
			};
		};

		const refreshTokenIfNeeded = async (authorizationHeader: RawAxiosRequestHeaders) => {
			if (
				authorizationHeader.Authorization &&
				typeof authorizationHeader.Authorization === "string"
			) {
				const currentAccessToken = extractTokenFromHeader(
					authorizationHeader.Authorization,
				);
				const props = {
					...getLumberBaseProperties(documentId, tenantId),
					serviceName: "documentManager",
					scopes,
				};
				const newAccessToken = await getValidAccessToken(
					currentAccessToken,
					this.tenantManager,
					tenantId,
					documentId,
					scopes,
					props,
				).catch((error) => {
					Lumberjack.error("Failed to refresh access token", props, error);
					throw error;
				});
				if (newAccessToken) {
					return {
						Authorization: `Basic ${newAccessToken}`,
					};
				}
				return undefined;
			}
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
			() => getGlobalTelemetryContext().getProperties().correlationId /* getCorrelationId */,
			() => getGlobalTelemetryContext().getProperties() /* getTelemetryContextProperties */,
			refreshTokenIfNeeded /* refreshTokenIfNeeded */,
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
