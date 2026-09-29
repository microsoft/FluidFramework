/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScopeType } from "@fluidframework/protocol-definitions";
import { BasicRestWrapper } from "@fluidframework/server-services-client";
import type {
	IDocumentManager,
	IDocument,
	ITenantManager,
	IDocumentStaticProperties,
	ICache,
	IReadDocumentOptions,
} from "@fluidframework/server-services-core";
import {
	Lumberjack,
	getLumberBaseProperties,
	getGlobalTelemetryContext,
} from "@fluidframework/server-services-telemetry";
import { logHttpMetrics } from "@fluidframework/server-services-utils";

import { getRefreshTokenIfNeededCallback } from "./tenant";

type IDeletionMarker = number;

/**
 * Manager to fetch document from Alfred using the internal URL.
 * @internal
 */
export class DocumentManager implements IDocumentManager {
	constructor(
		private readonly internalAlfredUrl: string,
		private readonly tenantManager: ITenantManager,
		private readonly documentStaticDataCache?: ICache,
		private readonly documentDeletionMarkerCache = documentStaticDataCache,
	) {
		if (!this.documentStaticDataCache) {
			Lumberjack.info(
				"DocumentManager static data cache is undefined, cache will not be used.",
			);
		}
	}

	/* eslint-disable @rushstack/no-new-null */
	public async readDocument(
		tenantId: string,
		documentId: string,
		options?: IReadDocumentOptions,
	): Promise<IDocument | null> {
		// Retrieve the document
		const restWrapper = await this.getBasicRestWrapper(tenantId, documentId, options);
		const document: IDocument = await restWrapper.get<IDocument>(
			`/documents/${tenantId}/${documentId}`,
		);
		if (!document) {
			return null;
		}

		return document;
	}
	/* eslint-enable @rushstack/no-new-null */

	public async readStaticProperties(
		tenantId: string,
		documentId: string,
		options?: IReadDocumentOptions,
	): Promise<IDocumentStaticProperties | undefined> {
		if (!this.documentStaticDataCache) {
			Lumberjack.verbose(
				"Falling back to database after attempting to read cached static document data, because the DocumentManager cache is undefined.",
				getLumberBaseProperties(documentId, tenantId),
			);
			return this.getDocumentStaticProperties(tenantId, documentId, options);
		}

		const staticPropsKey = DocumentManager.getDocumentStaticKey(tenantId, documentId);
		let staticPropsStr: string | undefined;
		try {
			staticPropsStr = (await this.documentStaticDataCache.get(staticPropsKey)) ?? undefined;
		} catch (error) {
			Lumberjack.warning(
				"Failed to read cached static document properties. Falling back to Alfred.",
				getLumberBaseProperties(documentId, tenantId),
				error,
			);
			await this.deleteStaticCacheEntry(tenantId, documentId);
			return this.getDocumentStaticProperties(tenantId, documentId, options);
		}
		if (!staticPropsStr) {
			Lumberjack.verbose(
				"Falling back to database after attempting to read cached static document data.",
				getLumberBaseProperties(documentId, tenantId),
			);
			return this.getDocumentStaticProperties(tenantId, documentId, options);
		}

		let staticProps: IDocumentStaticProperties;
		try {
			staticProps = JSON.parse(staticPropsStr) as IDocumentStaticProperties;
		} catch (error) {
			Lumberjack.warning(
				"Cached static document properties are malformed. Falling back to Alfred.",
				getLumberBaseProperties(documentId, tenantId),
				error,
			);
			await this.deleteStaticCacheEntry(tenantId, documentId);
			return this.getDocumentStaticProperties(tenantId, documentId, options);
		}
		if (
			!DocumentManager.areStaticPropertiesValid(staticProps) ||
			staticProps.tenantId !== tenantId ||
			staticProps.documentId !== documentId
		) {
			Lumberjack.warning(
				"Cached static document properties are invalid or do not match the requested identity. Falling back to Alfred.",
				getLumberBaseProperties(documentId, tenantId),
			);
			await this.deleteStaticCacheEntry(tenantId, documentId);
			return this.getDocumentStaticProperties(tenantId, documentId, options);
		}
		const markerAfterRead = await this.getDeletionMarker(tenantId, documentId);
		if (DocumentManager.isDeletedGeneration(staticProps.createTime, markerAfterRead)) {
			await this.deleteStaticCacheEntry(tenantId, documentId);
			return this.getDocumentStaticProperties(tenantId, documentId, options);
		}
		return staticProps;
	}

	public async purgeStaticCache(
		tenantId: string,
		documentId: string,
		createTime?: number,
	): Promise<void> {
		if (!this.documentDeletionMarkerCache) {
			throw new Error("Document deletion requires a cache for persistent deletion markers.");
		}
		const deletedKey = DocumentManager.getDocumentDeletedKey(tenantId, documentId);
		await this.documentDeletionMarkerCache.set(
			deletedKey,
			JSON.stringify(Number.isFinite(createTime) ? (createTime as number) : Date.now()),
		);
		await this.deleteStaticCacheEntry(tenantId, documentId);
	}

	private async getDocumentStaticProperties(
		tenantId: string,
		documentId: string,
		options?: IReadDocumentOptions,
	): Promise<IDocumentStaticProperties | undefined> {
		const document = await this.readDocument(tenantId, documentId, options);
		if (!document) {
			Lumberjack.warning(
				"Fallback to database failed, document not found.",
				getLumberBaseProperties(documentId, tenantId),
			);
			return undefined;
		}
		if (document.tenantId !== tenantId || document.documentId !== documentId) {
			Lumberjack.warning(
				"Alfred document identity does not match the requested identity.",
				getLumberBaseProperties(documentId, tenantId),
			);
			return undefined;
		}
		if (document.scheduledDeletionTime !== undefined) {
			Lumberjack.warning(
				"Document is soft-deleted. Static properties will not be returned or cached.",
				getLumberBaseProperties(documentId, tenantId),
			);
			return undefined;
		}
		const markerBeforeSet = await this.getDeletionMarker(tenantId, documentId);
		if (DocumentManager.isDeletedGeneration(document.createTime, markerBeforeSet)) {
			return undefined;
		}

		const staticProps = DocumentManager.getStaticPropsFromDoc(document);
		if (this.documentStaticDataCache && DocumentManager.areStaticPropertiesValid(staticProps)) {
			const staticPropsKey = DocumentManager.getDocumentStaticKey(tenantId, documentId);
			await this.documentStaticDataCache.set(staticPropsKey, JSON.stringify(staticProps));
			const markerAfterSet = await this.getDeletionMarker(tenantId, documentId);
			if (DocumentManager.isDeletedGeneration(document.createTime, markerAfterSet)) {
				await this.deleteStaticCacheEntry(tenantId, documentId);
				return undefined;
			}
		}
		return staticProps;
	}

	private async getBasicRestWrapper(
		tenantId: string,
		documentId: string,
		options?: IReadDocumentOptions,
	) {
		const scopes = [ScopeType.DocRead];
		const usesProvidedAccessToken = options?.accessToken !== undefined;
		const accessToken = usesProvidedAccessToken
			? options.accessToken
			: await this.tenantManager.signToken(tenantId, documentId, scopes);
		const getDefaultHeaders = () => {
			return {
				Authorization: `Basic ${accessToken}`,
			};
		};

		const refreshTokenIfNeeded = usesProvidedAccessToken
			? undefined
			: getRefreshTokenIfNeededCallback(
					this.tenantManager,
					documentId,
					tenantId,
					scopes,
					"documentManager",
			  );
		const refreshDefaultHeaders = usesProvidedAccessToken ? undefined : getDefaultHeaders;

		const restWrapper = new BasicRestWrapper(
			this.internalAlfredUrl,
			undefined /* defaultQueryString */,
			undefined /* maxBodyLength */,
			undefined /* maxContentLength */,
			getDefaultHeaders(),
			undefined /* Axios */,
			undefined /* refreshDefaultQueryString */,
			refreshDefaultHeaders,
			() => getGlobalTelemetryContext().getProperties().correlationId /* getCorrelationId */,
			() => getGlobalTelemetryContext().getProperties() /* getTelemetryContextProperties */,
			refreshTokenIfNeeded /* refreshTokenIfNeeded */,
			logHttpMetrics,
			() => getGlobalTelemetryContext().getProperties().serviceName ?? "" /* serviceName */,
		);
		return restWrapper;
	}

	/**
	 * Creates a cache key for one tenant/document identity.
	 *
	 * @param tenantId - Tenant that owns the document
	 * @param documentId - Document whose static data is cached
	 * @returns An unambiguous tenant-qualified static-data cache key
	 */
	private static getDocumentStaticKey(tenantId: string, documentId: string): string {
		return `staticData:${encodeURIComponent(tenantId)}:${encodeURIComponent(documentId)}`;
	}

	private static getDocumentDeletedKey(tenantId: string, documentId: string): string {
		return `deletedDocument:${encodeURIComponent(tenantId)}:${encodeURIComponent(documentId)}`;
	}

	private async getDeletionMarker(
		tenantId: string,
		documentId: string,
	): Promise<IDeletionMarker | undefined> {
		if (!this.documentDeletionMarkerCache) {
			return undefined;
		}
		const deletedKey = DocumentManager.getDocumentDeletedKey(tenantId, documentId);
		const marker = await this.documentDeletionMarkerCache.get(deletedKey);
		if (marker === null) {
			return undefined;
		}
		const parsedMarker = JSON.parse(marker) as IDeletionMarker;
		if (!Number.isFinite(parsedMarker)) {
			throw new Error("Document deletion marker is malformed.");
		}
		return parsedMarker;
	}

	private async deleteStaticCacheEntry(tenantId: string, documentId: string): Promise<void> {
		if (!this.documentStaticDataCache?.delete) {
			Lumberjack.error(
				"Cannot delete document static properties cache entry, because the cache does not have a delete function.",
			);
			return;
		}

		const staticPropsKey = DocumentManager.getDocumentStaticKey(tenantId, documentId);
		await this.documentStaticDataCache.delete(staticPropsKey);
	}

	private static areStaticPropertiesValid(staticProps: IDocumentStaticProperties): boolean {
		return (
			typeof staticProps === "object" &&
			staticProps !== null &&
			typeof staticProps.version === "string" &&
			Number.isFinite(staticProps.createTime) &&
			typeof staticProps.documentId === "string" &&
			typeof staticProps.tenantId === "string" &&
			(staticProps.storageName === undefined ||
				typeof staticProps.storageName === "string") &&
			(staticProps.isEphemeralContainer === undefined ||
				typeof staticProps.isEphemeralContainer === "boolean")
		);
	}

	private static isDeletedGeneration(
		createTime: number,
		marker: IDeletionMarker | undefined,
	): boolean {
		return marker !== undefined && createTime <= marker;
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
