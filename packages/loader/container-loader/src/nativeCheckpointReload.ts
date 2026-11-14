/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter, type ILayerCompatDetails } from "@fluid-internal/client-utils";
import { LoaderHeader, type IContainer } from "@fluidframework/container-definitions/internal";
import type { FluidObject, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import type {
	IDocumentService,
	IDocumentServiceEvents,
	IDocumentServiceFactory,
	IDocumentStorageService,
	IResolvedUrl,
	ISnapshot,
	ISnapshotFetchOptions,
	ISnapshotTree,
	IVersion,
} from "@fluidframework/driver-definitions/internal";
import { FetchSource } from "@fluidframework/driver-definitions/internal";
import { DocumentStorageServiceProxy } from "@fluidframework/driver-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	loadExistingContainer,
	type ILoadExistingContainerProps,
} from "./createAndLoadContainerUtils.js";

/** The acknowledged application-state boundary the host requires on reload. @internal */
export interface NativeCheckpointReloadBoundary {
	readonly id: string;
	readonly sequenceNumber: number;
}

/**
 * Loads latest service state after the host stops using its old container.
 * The host must clear its pending-state store and document-scoped caches before loading.
 * Driver caches are bypassed even if asynchronous disposal-driven eviction has not completed.
 * Never accepts pending state, reconnects the old container, or falls back to an older snapshot.
 * @internal
 */
export async function loadContainerAfterNativeCheckpointRestore(
	props: Omit<ILoadExistingContainerProps, "pendingLocalState">,
	boundary: NativeCheckpointReloadBoundary,
	clearPersistedState: () => Promise<void>,
): Promise<IContainer> {
	if (!Number.isSafeInteger(boundary.sequenceNumber) || boundary.sequenceNumber < 0) {
		throw new UsageError("Invalid native checkpoint reload boundary");
	}
	await clearPersistedState();
	return loadExistingContainer({
		...props,
		// Explicitly override even if a JavaScript caller supplied this omitted property.
		pendingLocalState: undefined,
		documentServiceFactory: new NativeCheckpointReloadFactory(
			props.documentServiceFactory,
			boundary,
		),
		request: {
			...props.request,
			headers: {
				...props.request.headers,
				[LoaderHeader.cache]: false,
				[LoaderHeader.version]: undefined,
			},
		},
	});
}

/** Makes owned service instances without mutating the caller's driver factory. */
class NativeCheckpointReloadFactory implements IDocumentServiceFactory {
	public readonly ILayerCompatDetails: ILayerCompatDetails | undefined;
	public constructor(
		private readonly factory: IDocumentServiceFactory,
		private readonly boundary: NativeCheckpointReloadBoundary,
	) {
		const compatibleFactory: IDocumentServiceFactory & FluidObject<ILayerCompatDetails> =
			factory;
		this.ILayerCompatDetails = compatibleFactory.ILayerCompatDetails;
	}

	public async createDocumentService(
		resolvedUrl: IResolvedUrl,
		logger?: ITelemetryBaseLogger,
		clientIsSummarizer?: boolean,
	): Promise<IDocumentService> {
		return new NativeCheckpointReloadService(
			await this.factory.createDocumentService(resolvedUrl, logger, clientIsSummarizer),
			this.boundary,
		);
	}

	public async createContainer(): Promise<IDocumentService> {
		throw new UsageError("Native checkpoint reload cannot create a container");
	}
}

/** Forwards service lifetime, events and policies while replacing only snapshot reads. */
class NativeCheckpointReloadService
	extends TypedEventEmitter<IDocumentServiceEvents>
	implements IDocumentService
{
	public constructor(
		private readonly service: IDocumentService,
		private readonly boundary: NativeCheckpointReloadBoundary,
	) {
		super();
		service.on?.("metadataUpdate", this.onMetadataUpdate);
	}
	private readonly onMetadataUpdate = (metadata: Record<string, string>): void => {
		this.emit("metadataUpdate", metadata);
	};
	public get resolvedUrl(): IResolvedUrl {
		return this.service.resolvedUrl;
	}
	public get policies(): IDocumentService["policies"] {
		return this.service.policies;
	}
	public async connectToStorage(): Promise<IDocumentStorageService> {
		return new NativeCheckpointReloadStorage(
			await this.service.connectToStorage(),
			this.boundary,
		);
	}
	public async connectToDeltaStorage(): ReturnType<IDocumentService["connectToDeltaStorage"]> {
		return this.service.connectToDeltaStorage();
	}
	public async connectToDeltaStream(
		...args: Parameters<IDocumentService["connectToDeltaStream"]>
	): ReturnType<IDocumentService["connectToDeltaStream"]> {
		return this.service.connectToDeltaStream(...args);
	}
	public dispose(error?: unknown): void {
		this.service.off?.("metadataUpdate", this.onMetadataUpdate);
		this.service.dispose(error);
	}
}

/** Bypasses driver caches and checks the boundary before the runtime sees a snapshot. @internal */
export class NativeCheckpointReloadStorage extends DocumentStorageServiceProxy {
	public constructor(
		storage: IDocumentStorageService,
		private readonly boundary: NativeCheckpointReloadBoundary,
	) {
		super(storage);
	}
	public override async getVersions(
		...args: Parameters<IDocumentStorageService["getVersions"]>
	): Promise<IVersion[]> {
		return super.getVersions(args[0], args[1], args[2], FetchSource.noCache);
	}
	public override async getSnapshot(options?: ISnapshotFetchOptions): Promise<ISnapshot> {
		const snapshot = await super.getSnapshot({
			...options,
			cacheSnapshot: false,
			fetchSource: FetchSource.noCache,
		});
		await this.validateBoundary(snapshot.snapshotTree, snapshot.blobContents);
		return snapshot;
	}
	public override async getSnapshotTree(
		...args: Parameters<IDocumentStorageService["getSnapshotTree"]>
	): ReturnType<IDocumentStorageService["getSnapshotTree"]> {
		const snapshot = await super.getSnapshotTree(...args);
		if (snapshot === null) {
			throw new UsageError("Native checkpoint reload snapshot is missing");
		}
		await this.validateBoundary(snapshot);
		return snapshot;
	}
	private async validateBoundary(
		snapshot: ISnapshotTree,
		blobs?: Map<string, ArrayBuffer>,
	): Promise<void> {
		const app = snapshot.trees[".app"] ?? snapshot;
		const catalogId = app.blobs[".nativeCheckpoints"];
		if (catalogId === undefined) {
			throw new UsageError("Native checkpoint reload catalog is missing");
		}
		const bytes = blobs?.get(catalogId) ?? (await this.readBlob(catalogId));
		const catalog: unknown = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes)));
		const restored: unknown = isRecord(catalog) ? catalog.restored : undefined;
		if (
			!isRecord(restored) ||
			typeof restored.sequenceNumber !== "number" ||
			!Number.isSafeInteger(restored.sequenceNumber) ||
			restored.sequenceNumber < this.boundary.sequenceNumber ||
			(restored.sequenceNumber === this.boundary.sequenceNumber &&
				restored.id !== this.boundary.id)
		) {
			throw new UsageError("Native checkpoint reload returned stale state");
		}
	}
}

/** Narrows untrusted snapshot JSON without casting its shape. */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
