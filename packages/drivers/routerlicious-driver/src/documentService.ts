/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils/internal";
import { IClient } from "@fluidframework/driver-definitions";
import {
	IDocumentServiceEvents,
	IDocumentServicePolicies,
	IDocumentDeltaConnection,
	IDocumentDeltaStorageService,
	IDocumentService,
	IDocumentStorageService,
	IDocumentStorageServicePolicies,
	IResolvedUrl,
} from "@fluidframework/driver-definitions/internal";
import {
	NetworkErrorBasic,
	RateLimiter,
	canRetryOnError,
} from "@fluidframework/driver-utils/internal";
import {
	ITelemetryLoggerExt,
	PerformanceEvent,
	wrapError,
} from "@fluidframework/telemetry-utils/internal";

import { ICache } from "./cache.js";
import { INormalizedWholeSnapshot } from "./contracts.js";
import { ISnapshotTreeVersion } from "./definitions.js";
import { DeltaStorageService, DocumentDeltaStorageService } from "./deltaStorageService.js";
import { R11sDocumentDeltaConnection } from "./documentDeltaConnection.js";
import { DocumentStorageService } from "./documentStorageService.js";
import { RouterliciousErrorTypes, type IR11sError } from "./errorUtils.js";
import { GitManager } from "./gitManager.js";
import { Historian } from "./historian.js";
import { NullBlobStorageService } from "./nullBlobStorageService.js";
import { pkgVersion as driverVersion } from "./packageVersion.js";
import { IRouterliciousDriverPolicies } from "./policies.js";
import {
	RouterliciousOrdererRestWrapper,
	RouterliciousStorageRestWrapper,
	TokenFetcher,
} from "./restWrapper.js";
import { RestWrapper } from "./restWrapperBase.js";
import type { IGetSessionInfoResponse } from "./sessionInfoManager.js";
import { SocketIOClientStatic } from "./socketModule.js";
import { ITokenProvider } from "./tokens.js";

/**
 * The DocumentService manages the Socket.IO connection and manages routing requests to connected
 * clients.
 */
export class DocumentService
	extends TypedEventEmitter<IDocumentServiceEvents>
	implements IDocumentService
{
	private storageManager: GitManager | undefined;
	private noCacheStorageManager: GitManager | undefined;

	private _policies: IDocumentServicePolicies | undefined;

	public get resolvedUrl() {
		return this._resolvedUrl;
	}

	constructor(
		private _resolvedUrl: IResolvedUrl,
		protected ordererUrl: string,
		private deltaStorageUrl: string,
		private deltaStreamUrl: string,
		private storageUrl: string,
		private readonly logger: ITelemetryLoggerExt,
		protected tokenProvider: ITokenProvider,
		protected tenantId: string,
		protected documentId: string,
		protected ordererRestWrapper: RouterliciousOrdererRestWrapper,
		private readonly documentStorageServicePolicies: IDocumentStorageServicePolicies,
		private readonly driverPolicies: IRouterliciousDriverPolicies,
		private readonly blobCache: ICache<ArrayBufferLike>,
		private readonly wholeSnapshotTreeCache: ICache<INormalizedWholeSnapshot>,
		private readonly shreddedSummaryTreeCache: ICache<ISnapshotTreeVersion>,
		private readonly getSessionInfo: () => Promise<IGetSessionInfoResponse>,
		private storageRestWrapper: RouterliciousStorageRestWrapper,
		private readonly storageTokenFetcher: TokenFetcher,
		private readonly ordererTokenFetcher: TokenFetcher,
	) {
		super();
	}

	private documentStorageService: DocumentStorageService | undefined;

	public get policies(): IDocumentServicePolicies | undefined {
		return this._policies;
	}

	public dispose() {}

	/**
	 * Connects to a storage endpoint for snapshot service.
	 *
	 * @returns returns the document storage service for routerlicious driver.
	 */
	public async connectToStorage(): Promise<IDocumentStorageService> {
		if (this.documentStorageService !== undefined) {
			return this.documentStorageService;
		}

		if (this.storageUrl === undefined) {
			return new NullBlobStorageService();
		}

		const getStorageManager = async (disableCache?: boolean): Promise<GitManager> => {
			const refreshed = await this.refreshSessionInfoIfNeeded();
			if (!this.storageManager || !this.noCacheStorageManager || refreshed) {
				if (refreshed) {
					const rateLimiter = new RateLimiter(
						this.driverPolicies.maxConcurrentStorageRequests,
					);
					this.storageRestWrapper = RouterliciousStorageRestWrapper.load(
						this.tenantId,
						this.storageTokenFetcher,
						this.logger,
						rateLimiter,
						this.driverPolicies.enableRestLess,
						this.storageUrl /* baseUrl */,
					);
				}
				const historian = new Historian(true, false, this.storageRestWrapper);
				this.storageManager = new GitManager(historian);
				const noCacheHistorian = new Historian(true, true, this.storageRestWrapper);
				this.noCacheStorageManager = new GitManager(noCacheHistorian);
			}

			return disableCache ? this.noCacheStorageManager : this.storageManager;
		};
		// Initialize storageManager and noCacheStorageManager
		const storageManager = await getStorageManager();
		const noCacheStorageManager = await getStorageManager(true);
		this.documentStorageService = new DocumentStorageService(
			this.documentId,
			storageManager,
			this.logger,
			this.documentStorageServicePolicies,
			this.driverPolicies,
			this.blobCache,
			this.wholeSnapshotTreeCache,
			this.shreddedSummaryTreeCache,
			noCacheStorageManager,
			getStorageManager,
		);
		return this.documentStorageService;
	}

	/**
	 * Connects to a delta storage endpoint for getting ops between a range.
	 *
	 * @returns returns the document delta storage service for routerlicious driver.
	 */
	public async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
		await this.connectToStorage();
		assert(!!this.documentStorageService, 0x0b1 /* "Storage service not initialized" */);

		const getRestWrapper = async (): Promise<RestWrapper> => {
			const refreshed = await this.refreshSessionInfoIfNeeded();

			if (refreshed) {
				const rateLimiter = new RateLimiter(this.driverPolicies.maxConcurrentOrdererRequests);
				this.ordererRestWrapper = RouterliciousOrdererRestWrapper.load(
					this.ordererTokenFetcher,
					this.logger,
					rateLimiter,
					this.driverPolicies.enableRestLess,
				);
			}
			return this.ordererRestWrapper;
		};
		const restWrapper = await getRestWrapper();
		const deltaStorageService = new DeltaStorageService(
			this.deltaStorageUrl,
			restWrapper,
			this.logger,
			getRestWrapper,
			() => this.deltaStorageUrl,
		);
		return new DocumentDeltaStorageService(
			this.tenantId,
			this.documentId,
			deltaStorageService,
			this.documentStorageService,
			this.logger,
		);
	}

	/**
	 * Connects to a delta stream endpoint for emitting ops.
	 *
	 * @returns returns the document delta stream service for routerlicious driver.
	 */
	public async connectToDeltaStream(client: IClient): Promise<IDocumentDeltaConnection> {
		const connect = async (refreshToken?: boolean) => {
			let ordererToken = await this.ordererRestWrapper.getToken();
			await this.refreshSessionInfoIfNeeded();

			if (refreshToken) {
				ordererToken = await PerformanceEvent.timedExecAsync(
					this.logger,
					{
						eventName: "GetDeltaStreamToken",
						docId: this.documentId,
						details: JSON.stringify({
							refreshToken,
						}),
					},
					async () =>
						this.tokenProvider
							.fetchOrdererToken(this.tenantId, this.documentId, refreshToken)
							.then(
								(newOrdererToken) => {
									this.ordererRestWrapper.setToken(newOrdererToken);
									return newOrdererToken;
								},
								(error) => {
									const tokenError = wrapError(
										error,
										(errorMessage) =>
											new NetworkErrorBasic(
												`The Host-provided token fetcher threw an error`,
												RouterliciousErrorTypes.fetchTokenError,
												canRetryOnError(error),
												{ errorMessage, driverVersion },
											),
									);
									throw tokenError;
								},
							),
				);
			}

			return PerformanceEvent.timedExecAsync(
				this.logger,
				{
					eventName: "ConnectToDeltaStream",
					docId: this.documentId,
				},
				async () => {
					return R11sDocumentDeltaConnection.create(
						this.tenantId,
						this.documentId,
						ordererToken.jwt,
						SocketIOClientStatic,
						client,
						this.deltaStreamUrl,
						this.logger,
						undefined /* timeoutMs */,
						this.driverPolicies.enableLongPollingDowngrade,
					);
				},
			);
		};

		// Attempt to establish connection.
		// Retry with new token on authorization error; otherwise, allow container layer to handle.
		try {
			const connection = await connect();
			// Enable single-commit summaries via driver policy based on the enable_single_commit_summary flag which maybe provided by the service during connection.
			// summarizeProtocolTree flag is used by the loader layer to attach protocol tree along with the summary required in the single-commit summaries.
			const shouldSummarizeProtocolTree = (connection as R11sDocumentDeltaConnection).details
				?.supportedFeatures?.enable_single_commit_summary
				? true
				: false;
			this._policies = {
				...this._policies,
				summarizeProtocolTree: shouldSummarizeProtocolTree,
			};

			return connection;
		} catch (error: any) {
			if (
				typeof error === "object" &&
				error !== null &&
				(error as Partial<IR11sError>).errorType === RouterliciousErrorTypes.authorizationError
			) {
				// Fetch new token and retry once,
				// otherwise 401/403 will be bubbled up as non-retriable AuthorizationError.
				return connect(true /* refreshToken */);
			}
			throw error;
		}
	}

	/**
	 * Refresh session info URLs if necessary.
	 * @returns boolean - true if session info was refreshed
	 */
	private async refreshSessionInfoIfNeeded(): Promise<boolean> {
		const response = await this.getSessionInfo();
		if (!response.refreshed) {
			return false;
		}
		const fluidResolvedUrl = response.resolvedUrl;
		this._resolvedUrl = fluidResolvedUrl;
		this.storageUrl = fluidResolvedUrl.endpoints?.storageUrl;
		this.ordererUrl = fluidResolvedUrl.endpoints?.ordererUrl;
		this.deltaStorageUrl = fluidResolvedUrl.endpoints?.deltaStorageUrl;
		this.deltaStreamUrl = fluidResolvedUrl.endpoints.deltaStreamUrl ?? this.ordererUrl;
		return true;
	}
}
