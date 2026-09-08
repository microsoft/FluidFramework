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
} from "@fluidframework/server-services-core";
import {
	Lumberjack,
	getLumberBaseProperties,
	getGlobalTelemetryContext,
} from "@fluidframework/server-services-telemetry";
import { logHttpMetrics } from "@fluidframework/server-services-utils";

import { getRefreshTokenIfNeededCallback } from "./tenant";

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

		return document;
	}

	public async readStaticProperties(
		tenantId: string,
		documentId: string,
	): Promise<IDocumentStaticProperties | undefined> {
		if (!this.documentStaticDataCache) {
			Lumberjack.verbose(
				"Falling back to database after attempting to read cached static document data, because the DocumentManager cache is undefined.",
				getLumberBaseProperties(documentId, tenantId),
			);
			return this.getDocumentStaticProperties(tenantId, documentId);
		}

		const staticPropsKey = DocumentManager.getDocumentStaticKey(tenantId, documentId);
		const staticPropsStr =
			(await this.documentStaticDataCache.get(staticPropsKey)) ?? undefined;
		if (!staticPropsStr) {
			Lumberjack.verbose(
				"Falling back to database after attempting to read cached static document data.",
				getLumberBaseProperties(documentId, tenantId),
			);
			return this.getDocumentStaticProperties(tenantId, documentId);
		}

		const staticProps = JSON.parse(staticPropsStr) as IDocumentStaticProperties;
		if (staticProps.tenantId !== tenantId || staticProps.documentId !== documentId) {
			Lumberjack.warning(
				"Cached static document identity does not match the requested identity.",
				getLumberBaseProperties(documentId, tenantId),
			);
			return undefined;
		}
		return staticProps;
	}

	public async purgeStaticCache(tenantId: string, documentId: string): Promise<void> {
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

		const staticPropsKey = DocumentManager.getDocumentStaticKey(tenantId, documentId);
		await this.documentStaticDataCache.delete(staticPropsKey);
	}

	private async getDocumentStaticProperties(
		tenantId: string,
		documentId: string,
	): Promise<IDocumentStaticProperties | undefined> {
		const document = await this.readDocument(tenantId, documentId);
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

		const staticProps = DocumentManager.getStaticPropsFromDoc(document);
		if (this.documentStaticDataCache) {
			const staticPropsKey = DocumentManager.getDocumentStaticKey(tenantId, documentId);
			await this.documentStaticDataCache.set(staticPropsKey, JSON.stringify(staticProps));
		}
		return staticProps;
	}

	private async getBasicRestWrapper(tenantId: string, documentId: string) {
		const scopes = [ScopeType.DocRead];
		const accessToken = await this.tenantManager.signToken(tenantId, documentId, scopes);
		const getDefaultHeaders = () => {
			return {
				Authorization: `Basic ${accessToken}`,
			};
		};

		const refreshTokenIfNeeded = getRefreshTokenIfNeededCallback(
			this.tenantManager,
			documentId,
			tenantId,
			scopes,
			"documentManager",
		);

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
