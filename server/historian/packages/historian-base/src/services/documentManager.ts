/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocumentManager as BaseDocumentManager } from "@fluidframework/server-services";
import type {
	IDocument,
	IDocumentStaticProperties,
	IReadDocumentOptions,
	ITenantManager,
} from "@fluidframework/server-services-core";
import { Lumberjack, getLumberBaseProperties } from "@fluidframework/server-services-telemetry";

import type { ICache } from "./definitions";

export class DocumentManager extends BaseDocumentManager {
	public constructor(
		internalAlfredUrl: string,
		tenantManager: ITenantManager,
		private readonly staticDataCache?: ICache,
	) {
		super(internalAlfredUrl, tenantManager);
	}

	public override async readStaticProperties(
		tenantId: string,
		documentId: string,
		options?: IReadDocumentOptions,
	): Promise<IDocumentStaticProperties | undefined> {
		if (this.staticDataCache === undefined) {
			return this.loadDocumentStaticProperties(tenantId, documentId, options);
		}
		if (await this.isDocumentDeleted(tenantId, documentId)) {
			return undefined;
		}

		const staticPropsKey = DocumentManager.getHistorianStaticKey(tenantId, documentId);
		let cachedValue: unknown;
		try {
			cachedValue = await this.staticDataCache.get<unknown>(staticPropsKey);
		} catch (error) {
			Lumberjack.warning(
				"Failed to read cached static document properties. Falling back to Alfred.",
				getLumberBaseProperties(documentId, tenantId),
				error,
			);
			await this.staticDataCache.delete(staticPropsKey);
			return this.loadDocumentStaticProperties(tenantId, documentId, options);
		}
		if (cachedValue === null || cachedValue === undefined) {
			return this.loadDocumentStaticProperties(tenantId, documentId, options);
		}

		let staticProps: IDocumentStaticProperties;
		try {
			staticProps =
				typeof cachedValue === "string"
					? (JSON.parse(cachedValue) as IDocumentStaticProperties)
					: (cachedValue as IDocumentStaticProperties);
		} catch (error) {
			Lumberjack.warning(
				"Cached static document properties are malformed. Falling back to Alfred.",
				getLumberBaseProperties(documentId, tenantId),
				error,
			);
			await this.staticDataCache.delete(staticPropsKey);
			return this.loadDocumentStaticProperties(tenantId, documentId, options);
		}
		if (
			!DocumentManager.areCachedPropertiesValid(staticProps) ||
			staticProps.tenantId !== tenantId ||
			staticProps.documentId !== documentId
		) {
			Lumberjack.warning(
				"Cached static document properties are invalid or do not match the requested identity. Falling back to Alfred.",
				getLumberBaseProperties(documentId, tenantId),
			);
			await this.staticDataCache.delete(staticPropsKey);
			return this.loadDocumentStaticProperties(tenantId, documentId, options);
		}
		return staticProps;
	}

	public override async purgeStaticCache(tenantId: string, documentId: string): Promise<void> {
		if (this.staticDataCache === undefined) {
			Lumberjack.error(
				"Cannot purge document static properties cache, because the cache is undefined.",
			);
			return;
		}
		await this.staticDataCache.set(
			DocumentManager.getHistorianDeletedKey(tenantId, documentId),
			true,
		);
		await this.staticDataCache.delete(
			DocumentManager.getHistorianStaticKey(tenantId, documentId),
		);
	}

	private async loadDocumentStaticProperties(
		tenantId: string,
		documentId: string,
		options?: IReadDocumentOptions,
	): Promise<IDocumentStaticProperties | undefined> {
		const document = await this.readDocument(tenantId, documentId, options);
		if (
			document === null ||
			document.tenantId !== tenantId ||
			document.documentId !== documentId ||
			document.scheduledDeletionTime !== undefined
		) {
			return undefined;
		}
		if (await this.isDocumentDeleted(tenantId, documentId)) {
			return undefined;
		}

		const staticProps = DocumentManager.getStaticPropsFromDocument(document);
		if (
			this.staticDataCache !== undefined &&
			DocumentManager.areCachedPropertiesValid(staticProps)
		) {
			await this.staticDataCache.set(
				DocumentManager.getHistorianStaticKey(tenantId, documentId),
				staticProps,
			);
		}
		return staticProps;
	}

	private async isDocumentDeleted(tenantId: string, documentId: string): Promise<boolean> {
		if (this.staticDataCache === undefined) {
			return false;
		}
		const deleted = await this.staticDataCache.get(
			DocumentManager.getHistorianDeletedKey(tenantId, documentId),
		);
		return deleted !== null && deleted !== undefined;
	}

	private static getHistorianStaticKey(tenantId: string, documentId: string): string {
		return `staticData:${encodeURIComponent(tenantId)}:${encodeURIComponent(documentId)}`;
	}

	private static getHistorianDeletedKey(tenantId: string, documentId: string): string {
		return `deletedDocument:${encodeURIComponent(tenantId)}:${encodeURIComponent(documentId)}`;
	}

	private static getStaticPropsFromDocument(document: IDocument): IDocumentStaticProperties {
		return {
			version: document.version,
			createTime: document.createTime,
			documentId: document.documentId,
			tenantId: document.tenantId,
			storageName: document.storageName,
			isEphemeralContainer: document.isEphemeralContainer,
		};
	}

	private static areCachedPropertiesValid(staticProps: IDocumentStaticProperties): boolean {
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
}
