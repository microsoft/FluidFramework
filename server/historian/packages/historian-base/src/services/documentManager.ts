/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IDocument,
	IDocumentManager,
	IDocumentStaticProperties,
	IReadDocumentOptions,
} from "@fluidframework/server-services-core";
import { Lumberjack, getLumberBaseProperties } from "@fluidframework/server-services-telemetry";

import type { ICache } from "./definitions";

type IDeletionMarker = number;

interface IPersistentCache extends ICache {
	setDeletionMarkerIfNewer(key: string, deletedThroughCreateTime: number): Promise<void>;
}

export interface ISummaryDocumentManager extends IDocumentManager {
	readonly supportsSummaryStaticProperties: true;
	readStaticPropertiesForSummary(
		tenantId: string,
		documentId: string,
		options?: IReadDocumentOptions,
	): Promise<IDocumentStaticProperties | undefined>;
	readStaticPropertiesForSummaryDelete(
		tenantId: string,
		documentId: string,
		options?: IReadDocumentOptions,
	): Promise<IDocumentStaticProperties | undefined>;
	purgeStaticCache(tenantId: string, documentId: string, createTime?: number): Promise<void>;
}

export function isSummaryDocumentManager(
	documentManager: IDocumentManager,
): documentManager is ISummaryDocumentManager {
	return (
		(documentManager as Partial<ISummaryDocumentManager>).supportsSummaryStaticProperties ===
			true &&
		typeof (documentManager as Partial<ISummaryDocumentManager>)
			.readStaticPropertiesForSummary === "function" &&
		typeof (documentManager as Partial<ISummaryDocumentManager>)
			.readStaticPropertiesForSummaryDelete === "function" &&
		typeof (documentManager as Partial<ISummaryDocumentManager>).purgeStaticCache === "function"
	);
}

export class DocumentManager implements ISummaryDocumentManager {
	public readonly supportsSummaryStaticProperties = true;

	public constructor(
		private readonly authoritativeDocumentManager: IDocumentManager,
		private readonly staticDataCache?: ICache,
		private readonly deletionMarkerCache = staticDataCache,
	) {}

	public async readDocument(
		tenantId: string,
		documentId: string,
		options?: IReadDocumentOptions,
	): Promise<IDocument | null> {
		return this.authoritativeDocumentManager.readDocument(tenantId, documentId, options);
	}

	public async readStaticProperties(
		tenantId: string,
		documentId: string,
	): Promise<IDocumentStaticProperties | undefined> {
		return this.readStaticPropertiesForSummary(tenantId, documentId);
	}

	public async readStaticPropertiesForSummary(
		tenantId: string,
		documentId: string,
		options?: IReadDocumentOptions,
	): Promise<IDocumentStaticProperties | undefined> {
		if (this.staticDataCache === undefined) {
			return this.loadDocumentStaticProperties(tenantId, documentId, options);
		}

		const staticPropsKey = DocumentManager.getStaticKey(tenantId, documentId);
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

		const staticProps = await this.parseCachedStaticProperties(
			cachedValue,
			tenantId,
			documentId,
			options,
		);
		if (staticProps === undefined) {
			return undefined;
		}
		const markerAfterRead = await this.getDeletionMarker(tenantId, documentId);
		if (DocumentManager.isDeletedGeneration(staticProps.createTime, markerAfterRead)) {
			await this.staticDataCache.delete(staticPropsKey);
			return this.loadDocumentStaticProperties(tenantId, documentId, options);
		}
		return staticProps;
	}

	public async readStaticPropertiesForSummaryDelete(
		tenantId: string,
		documentId: string,
		options?: IReadDocumentOptions,
	): Promise<IDocumentStaticProperties | undefined> {
		const document = await this.readDocument(tenantId, documentId, options);
		if (
			document === null ||
			document.tenantId !== tenantId ||
			document.documentId !== documentId
		) {
			return undefined;
		}
		return DocumentManager.getStaticPropsFromDocument(document);
	}

	public async purgeStaticCache(
		tenantId: string,
		documentId: string,
		createTime?: number,
	): Promise<void> {
		const cache = this.getPersistentCache();
		await cache.setDeletionMarkerIfNewer(
			DocumentManager.getDeletedKey(tenantId, documentId),
			Number.isFinite(createTime) ? (createTime as number) : Date.now(),
		);
		await this.staticDataCache?.delete(DocumentManager.getStaticKey(tenantId, documentId));
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

		const markerBeforeSet = await this.getDeletionMarker(tenantId, documentId);
		if (DocumentManager.isDeletedGeneration(document.createTime, markerBeforeSet)) {
			return undefined;
		}

		const staticProps = DocumentManager.getStaticPropsFromDocument(document);
		if (
			this.staticDataCache !== undefined &&
			DocumentManager.areStaticPropertiesValid(staticProps)
		) {
			const staticKey = DocumentManager.getStaticKey(tenantId, documentId);
			await this.staticDataCache.set(staticKey, staticProps);
			const markerAfterSet = await this.getDeletionMarker(tenantId, documentId);
			if (DocumentManager.isDeletedGeneration(document.createTime, markerAfterSet)) {
				await this.staticDataCache.delete(staticKey);
				return undefined;
			}
		}
		return staticProps;
	}

	private async parseCachedStaticProperties(
		cachedValue: unknown,
		tenantId: string,
		documentId: string,
		options?: IReadDocumentOptions,
	): Promise<IDocumentStaticProperties | undefined> {
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
			await this.staticDataCache?.delete(DocumentManager.getStaticKey(tenantId, documentId));
			return this.loadDocumentStaticProperties(tenantId, documentId, options);
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
			await this.staticDataCache?.delete(DocumentManager.getStaticKey(tenantId, documentId));
			return this.loadDocumentStaticProperties(tenantId, documentId, options);
		}
		return staticProps;
	}

	private async getDeletionMarker(
		tenantId: string,
		documentId: string,
	): Promise<IDeletionMarker | undefined> {
		if (this.deletionMarkerCache === undefined) {
			return undefined;
		}
		const marker = await this.deletionMarkerCache.get<IDeletionMarker>(
			DocumentManager.getDeletedKey(tenantId, documentId),
		);
		if (marker === null || marker === undefined) {
			return undefined;
		}
		if (!Number.isFinite(marker)) {
			throw new Error("Document deletion marker is malformed.");
		}
		return marker;
	}

	private getPersistentCache(): IPersistentCache {
		if (
			this.deletionMarkerCache === undefined ||
			typeof (this.deletionMarkerCache as Partial<IPersistentCache>)
				.setDeletionMarkerIfNewer !== "function"
		) {
			throw new Error(
				"Document deletion requires a cache that supports persistent deletion markers.",
			);
		}
		return this.deletionMarkerCache as IPersistentCache;
	}

	private static getStaticKey(tenantId: string, documentId: string): string {
		return `staticData:${encodeURIComponent(tenantId)}:${encodeURIComponent(documentId)}`;
	}

	private static getDeletedKey(tenantId: string, documentId: string): string {
		return `deletedDocument:${encodeURIComponent(tenantId)}:${encodeURIComponent(documentId)}`;
	}

	private static isDeletedGeneration(
		createTime: number,
		marker: IDeletionMarker | undefined,
	): boolean {
		return marker !== undefined && createTime <= marker;
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
}
