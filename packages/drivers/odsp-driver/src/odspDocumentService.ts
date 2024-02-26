/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ITelemetryLoggerExt,
	createChildMonitoringContext,
	MonitoringContext,
} from "@fluidframework/telemetry-utils";
import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils";
import {
	IDocumentDeltaConnection,
	IDocumentDeltaStorageService,
	IDocumentService,
	IResolvedUrl,
	IDocumentStorageService,
	IDocumentServicePolicies,
	IDocumentServiceEvents,
} from "@fluidframework/driver-definitions";
import { IClient, ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import {
	IOdspResolvedUrl,
	TokenFetchOptions,
	IEntry,
	HostStoragePolicy,
	InstrumentedStorageTokenFetcher,
} from "@fluidframework/odsp-driver-definitions";
import { HostStoragePolicyInternal } from "./contracts.js";
import { IOdspCache } from "./odspCache.js";
import { OdspDeltaStorageService, OdspDeltaStorageWithCache } from "./odspDeltaStorageService.js";
import { OdspDocumentStorageService } from "./odspDocumentStorageManager.js";
import { getOdspResolvedUrl } from "./odspUtils.js";
import { isOdcOrigin } from "./odspUrlHelper.js";
import { EpochTracker } from "./epochTracker.js";
import { OpsCache } from "./opsCaching.js";
import { RetryErrorsStorageAdapter } from "./retryErrorsStorageAdapter.js";
import type { OdspDelayLoadedDeltaStream } from "./odspDelayLoadedDeltaStream.js";

/**
 * The DocumentService manages the Socket.IO connection and manages routing requests to connected
 * clients
 */
export class OdspDocumentService
	extends TypedEventEmitter<IDocumentServiceEvents>
	implements IDocumentService
{
	private readonly _policies: IDocumentServicePolicies;

	// Promise to load socket module only once.
	private socketModuleP: Promise<OdspDelayLoadedDeltaStream> | undefined;

	private odspDelayLoadedDeltaStream: OdspDelayLoadedDeltaStream | undefined;

	private odspSocketModuleLoaded: boolean = false;

	/**
	 * Creates a new OdspDocumentService instance.
	 *
	 * @param resolvedUrl - resolved url identifying document that will be managed by returned service instance.
	 * @param getStorageToken - function that can provide the storage token. This is is also referred to as
	 * the "Vroom" token in SPO.
	 * @param getWebsocketToken - function that can provide a token for accessing the web socket. This is also referred
	 * to as the "Push" token in SPO. If undefined then websocket token is expected to be returned with joinSession
	 * response payload.
	 * @param logger - a logger that can capture performance and diagnostic information
	 * @param cache - This caches response for joinSession.
	 * @param hostPolicy - This host constructed policy which customizes service behavior.
	 * @param epochTracker - This helper class which adds epoch to backend calls made by returned service instance.
	 * @param socketReferenceKeyPrefix - (optional) prefix to isolate socket reuse cache
	 */
	public static async create(
		resolvedUrl: IResolvedUrl,
		getStorageToken: InstrumentedStorageTokenFetcher,
		// eslint-disable-next-line @rushstack/no-new-null
		getWebsocketToken: ((options: TokenFetchOptions) => Promise<string | null>) | undefined,
		logger: ITelemetryLoggerExt,
		cache: IOdspCache,
		hostPolicy: HostStoragePolicy,
		epochTracker: EpochTracker,
		socketReferenceKeyPrefix?: string,
		clientIsSummarizer?: boolean,
	): Promise<IDocumentService> {
		return new OdspDocumentService(
			getOdspResolvedUrl(resolvedUrl),
			getStorageToken,
			getWebsocketToken,
			logger,
			cache,
			hostPolicy,
			epochTracker,
			socketReferenceKeyPrefix,
			clientIsSummarizer,
		);
	}

	private storageManager?: OdspDocumentStorageService;

	private readonly mc: MonitoringContext;

	private readonly hostPolicy: HostStoragePolicyInternal;

	private _opsCache?: OpsCache;

	/**
	 * @param odspResolvedUrl - resolved url identifying document that will be managed by this service instance.
	 * @param getStorageToken - function that can provide the storage token. This is is also referred to as
	 * the "Vroom" token in SPO.
	 * @param getWebsocketToken - function that can provide a token for accessing the web socket. This is also referred
	 * to as the "Push" token in SPO. If undefined then websocket token is expected to be returned with joinSession
	 * response payload.
	 * @param logger - a logger that can capture performance and diagnostic information
	 * @param socketIoClientFactory - A factory that returns a promise to the socket io library required by the driver
	 * @param cache - This caches response for joinSession.
	 * @param hostPolicy - host constructed policy which customizes service behavior.
	 * @param epochTracker - This helper class which adds epoch to backend calls made by this service instance.
	 * @param socketReferenceKeyPrefix - (optional) prefix to isolate socket reuse cache
	 */
	private constructor(
		public readonly odspResolvedUrl: IOdspResolvedUrl,
		private readonly getStorageToken: InstrumentedStorageTokenFetcher,
		private readonly getWebsocketToken:
			| ((options: TokenFetchOptions) => Promise<string | null>)
			| undefined,
		logger: ITelemetryLoggerExt,
		private readonly cache: IOdspCache,
		hostPolicy: HostStoragePolicy,
		private readonly epochTracker: EpochTracker,
		private readonly socketReferenceKeyPrefix?: string,
		private readonly clientIsSummarizer?: boolean,
	) {
		super();
		this._policies = {
			// load in storage-only mode if a file version is specified
			storageOnly: odspResolvedUrl.fileVersion !== undefined,
			summarizeProtocolTree: true,
			supportGetSnapshotApi: true,
		};

		this.mc = createChildMonitoringContext({
			logger,
			properties: {
				all: {
					odc: isOdcOrigin(
						new URL(this.odspResolvedUrl.endpoints.snapshotStorageUrl).origin,
					),
				},
			},
		});

		this.hostPolicy = hostPolicy;
		this.hostPolicy.supportGetSnapshotApi = this._policies.supportGetSnapshotApi;
		if (this.clientIsSummarizer) {
			this.hostPolicy = { ...this.hostPolicy, summarizerClient: true };
		}
	}

	public get resolvedUrl(): IResolvedUrl {
		return this.odspResolvedUrl;
	}
	public get policies(): IDocumentServicePolicies {
		return this._policies;
	}

	/**
	 * Connects to a storage endpoint for snapshot service.
	 *
	 * @returns returns the document storage service for sharepoint driver.
	 */
	public async connectToStorage(): Promise<IDocumentStorageService> {
		if (!this.storageManager) {
			this.storageManager = new OdspDocumentStorageService(
				this.odspResolvedUrl,
				this.getStorageToken,
				this.mc.logger,
				true,
				this.cache,
				this.hostPolicy,
				this.epochTracker,
				// flushCallback
				async () => {
					const currentConnection =
						this.odspDelayLoadedDeltaStream?.currentDeltaConnection;
					if (currentConnection !== undefined && !currentConnection.disposed) {
						return currentConnection.flush();
					}
					throw new Error(
						"Disconnected while uploading summary (attempt to perform flush())",
					);
				},
				() => {
					return this.odspDelayLoadedDeltaStream?.relayServiceTenantAndSessionId;
				},
				this.mc.config.getNumber("Fluid.Driver.Odsp.snapshotFormatFetchType"),
			);
		}

		return new RetryErrorsStorageAdapter(this.storageManager, this.mc.logger);
	}

	/**
	 * Connects to a delta storage endpoint for getting ops between a range.
	 *
	 * @returns returns the document delta storage service for sharepoint driver.
	 */
	public async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
		const snapshotOps = this.storageManager?.ops ?? [];
		const service = new OdspDeltaStorageService(
			this.odspResolvedUrl.endpoints.deltaStorageUrl,
			this.getStorageToken,
			this.epochTracker,
			this.mc.logger,
		);

		// batch size, please see issue #5211 for data around batch sizing
		const batchSize = this.hostPolicy.opsBatchSize ?? 5000;
		const concurrency = this.hostPolicy.concurrentOpsBatches ?? 1;
		return new OdspDeltaStorageWithCache(
			snapshotOps,
			this.mc.logger,
			batchSize,
			concurrency,
			// Get Ops from storage callback.
			async (from, to, telemetryProps, fetchReason) =>
				service.get(from, to, telemetryProps, fetchReason),
			// Get cachedOps Callback.
			async (from, to) => {
				const res = await this.opsCache?.get(from, to);
				return (res as ISequencedDocumentMessage[]) ?? [];
			},
			// Ops requestFromSocket Callback.
			(from, to) => {
				const currentConnection = this.odspDelayLoadedDeltaStream?.currentDeltaConnection;
				if (currentConnection !== undefined && !currentConnection.disposed) {
					currentConnection.requestOps(from, to);
				}
			},
			(ops: ISequencedDocumentMessage[]) => this.opsReceived(ops),
			() => this.storageManager,
		);
	}

	/**
	 * Connects to a delta stream endpoint for emitting ops.
	 *
	 * @returns returns the document delta stream service for onedrive/sharepoint driver.
	 */
	public async connectToDeltaStream(client: IClient): Promise<IDocumentDeltaConnection> {
		if (this.socketModuleP === undefined) {
			this.socketModuleP = this.getDelayLoadedDeltaStream();
		}
		return this.socketModuleP
			.then(async (m) => {
				this.odspSocketModuleLoaded = true;
				return m.connectToDeltaStream(client);
			})
			.catch((error) => {
				// Setting undefined in case someone tries to recover from module failure by calling again.
				this.socketModuleP = undefined;
				this.odspSocketModuleLoaded = false;
				throw error;
			});
	}

	/**
	 * This dynamically imports the module for loading the delta connection. In many cases the delta stream, is not
	 * required during the critical load flow. So this way we don't have to bundle this in the initial bundle and can
	 * import this later on when required.
	 * @returns The delta stream object.
	 */
	private async getDelayLoadedDeltaStream(): Promise<OdspDelayLoadedDeltaStream> {
		assert(this.odspSocketModuleLoaded === false, 0x507 /* Should be loaded only once */);
		const module = await import(
			/* webpackChunkName: "socketModule" */ "./odspDelayLoadedDeltaStream.js"
		)
			.then((m) => {
				this.mc.logger.sendTelemetryEvent({ eventName: "SocketModuleLoaded" });
				return m;
			})
			.catch((error) => {
				this.mc.logger.sendErrorEvent({ eventName: "SocketModuleLoadFailed" }, error);
				throw error;
			});
		this.odspDelayLoadedDeltaStream = new module.OdspDelayLoadedDeltaStream(
			this.odspResolvedUrl,
			this._policies,
			this.getStorageToken,
			this.getWebsocketToken,
			this.mc,
			this.cache,
			this.hostPolicy,
			this.epochTracker,
			(ops: ISequencedDocumentMessage[]) => this.opsReceived(ops),
			(metadata: Record<string, string>) => this.emit("metadataUpdate", metadata),
			this.socketReferenceKeyPrefix,
		);
		return this.odspDelayLoadedDeltaStream;
	}

	public dispose(error?: unknown): void {
		// Error might indicate mismatch between client & server knowledge about file
		// (OdspErrorTypes.fileOverwrittenInStorage).
		// For example, file might have been overwritten in storage without generating new epoch
		// In such case client cached info is stale and has to be removed.
		if (error === undefined) {
			this._opsCache?.flushOps();
		} else {
			this.epochTracker.removeEntries().catch(() => {});
		}
		this._opsCache?.dispose();
		// Only need to dipose this, if it is already loaded.
		this.odspDelayLoadedDeltaStream?.dispose();
	}

	protected get opsCache(): OpsCache | undefined {
		if (this._opsCache) {
			return this._opsCache;
		}

		const seqNumber = this.storageManager?.snapshotSequenceNumber;
		const batchSize = this.hostPolicy.opsCaching?.batchSize ?? 100;
		if (seqNumber === undefined || batchSize < 1) {
			return;
		}

		const opsKey: Omit<IEntry, "key"> = {
			type: "ops",
		};
		this._opsCache = new OpsCache(
			seqNumber,
			this.mc.logger,
			// ICache
			{
				write: async (key: string, opsData: string): Promise<void> => {
					return this.cache.persistedCache.put({ ...opsKey, key }, opsData);
				},
				read: async (key: string) => this.cache.persistedCache.get({ ...opsKey, key }),
				remove: (): void => {
					this.cache.persistedCache.removeEntries().catch(() => {});
				},
			},
			batchSize,
			this.hostPolicy.opsCaching?.timerGranularity ?? 5000,
			this.hostPolicy.opsCaching?.totalOpsToCache ?? 5000,
		);
		return this._opsCache;
	}

	// Called whenever re receive ops through any channel for this document (snapshot, delta connection, delta storage)
	// We use it to notify caching layer of how stale is snapshot stored in cache.
	protected opsReceived(ops: ISequencedDocumentMessage[]): void {
		// No need for two clients to save same ops
		if (ops.length === 0 || this.odspResolvedUrl.summarizer) {
			return;
		}

		this.opsCache?.addOps(ops);
	}
}
