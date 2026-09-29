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

interface IDeletionMarker {
	createTime?: number;
}

interface IPersistentCache extends ICache {
	setWithoutExpiry<T>(key: string, value: T): Promise<void>;
	deleteIfValueMatches<T>(key: string, value: T): Promise<boolean>;
}

export interface ISummaryDocumentManager extends IDocumentManager {
	readonly supportsSummaryStaticProperties: true;
	readStaticPropertiesForSummary(
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
		typeof (documentManager as Partial<ISummaryDocumentManager>).purgeStaticCache === "function"
	);
}

export class DocumentManager implements ISummaryDocumentManager {
	public readonly supportsSummaryStaticProperties = true;

	public constructor(
		private readonly authoritativeDocumentManager: IDocumentManager,
		private readonly staticDataCache?: ICache,
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

		const marker = await this.getDeletionMarker(tenantId, documentId);
		if (marker !== undefined) {
			return this.resolveDeletionMarker(tenantId, documentId, marker, options);
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
		if (markerAfterRead !== undefined) {
			await this.staticDataCache.delete(staticPropsKey);
			return this.resolveDeletionMarker(tenantId, documentId, markerAfterRead, options);
		}
		return staticProps;
	}

	public async purgeStaticCache(
		tenantId: string,
		documentId: string,
		createTime?: number,
	): Promise<void> {
		const cache = this.getPersistentCache();
		await cache.setWithoutExpiry(
			DocumentManager.getDeletedKey(tenantId, documentId),
			Number.isFinite(createTime) ? { createTime } : {},
		);
		await cache.delete(DocumentManager.getStaticKey(tenantId, documentId));
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
		if (markerBeforeSet !== undefined) {
			return this.resolveDeletionMarker(
				tenantId,
				documentId,
				markerBeforeSet,
				options,
				document,
			);
		}

		const staticProps = DocumentManager.getStaticPropsFromDocument(document);
		if (
			this.staticDataCache !== undefined &&
			DocumentManager.areStaticPropertiesValid(staticProps)
		) {
			const staticKey = DocumentManager.getStaticKey(tenantId, documentId);
			await this.staticDataCache.set(staticKey, staticProps);
			const markerAfterSet = await this.getDeletionMarker(tenantId, documentId);
			if (markerAfterSet !== undefined) {
				await this.staticDataCache.delete(staticKey);
				return this.resolveDeletionMarker(
					tenantId,
					documentId,
					markerAfterSet,
					options,
					document,
				);
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

	private async resolveDeletionMarker(
		tenantId: string,
		documentId: string,
		marker: IDeletionMarker,
		options?: IReadDocumentOptions,
		knownDocument?: IDocument,
	): Promise<IDocumentStaticProperties | undefined> {
		const document = knownDocument ?? (await this.readDocument(tenantId, documentId, options));
		if (
			document === null ||
			document.tenantId !== tenantId ||
			document.documentId !== documentId ||
			document.scheduledDeletionTime !== undefined ||
			!Number.isFinite(marker.createTime) ||
			document.createTime === marker.createTime
		) {
			return undefined;
		}

		const cache = this.getPersistentCache();
		const markerCleared = await cache.deleteIfValueMatches(
			DocumentManager.getDeletedKey(tenantId, documentId),
			marker,
		);
		if (markerCleared) {
			return this.loadDocumentStaticProperties(tenantId, documentId, options);
		}
		const currentMarker = await this.getDeletionMarker(tenantId, documentId);
		return currentMarker === undefined
			? this.loadDocumentStaticProperties(tenantId, documentId, options)
			: this.resolveDeletionMarker(tenantId, documentId, currentMarker, options, document);
	}

	private async getDeletionMarker(
		tenantId: string,
		documentId: string,
	): Promise<IDeletionMarker | undefined> {
		if (this.staticDataCache === undefined) {
			return undefined;
		}
		const marker = await this.staticDataCache.get<IDeletionMarker>(
			DocumentManager.getDeletedKey(tenantId, documentId),
		);
		return marker === null || marker === undefined ? undefined : marker;
	}

	private getPersistentCache(): IPersistentCache {
		if (
			this.staticDataCache === undefined ||
			typeof (this.staticDataCache as Partial<IPersistentCache>).setWithoutExpiry !==
				"function"
		) {
			throw new Error(
				"Document deletion requires a cache that supports persistent deletion markers.",
			);
		}
		return this.staticDataCache as IPersistentCache;
	}

	private static getStaticKey(tenantId: string, documentId: string): string {
		return `staticData:${encodeURIComponent(tenantId)}:${encodeURIComponent(documentId)}`;
	}

	private static getDeletedKey(tenantId: string, documentId: string): string {
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
