/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { performance } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils";
import {
	IFluidErrorBase,
	MonitoringContext,
	normalizeError,
} from "@fluidframework/telemetry-utils";
import {
	IDocumentDeltaConnection,
	IResolvedUrl,
	IDocumentServicePolicies,
	DriverErrorType,
} from "@fluidframework/driver-definitions";
import {
	DeltaStreamConnectionForbiddenError,
	NonRetryableError,
} from "@fluidframework/driver-utils";
import { IClient, ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import {
	IOdspResolvedUrl,
	TokenFetchOptions,
	HostStoragePolicy,
	InstrumentedStorageTokenFetcher,
	ISocketStorageDiscovery,
	OdspErrorType,
} from "@fluidframework/odsp-driver-definitions";
import { hasFacetCodes } from "@fluidframework/odsp-doclib-utils";
import { IOdspCache } from "./odspCache";
import { OdspDocumentDeltaConnection } from "./odspDocumentDeltaConnection";
import {
	getJoinSessionCacheKey,
	getWithRetryForTokenRefresh,
	TokenFetchOptionsEx,
} from "./odspUtils";
import { fetchJoinSession } from "./vroom";
import { EpochTracker } from "./epochTracker";
import { pkgVersion as driverVersion } from "./packageVersion";

/**
 * This OdspDelayLoadedDeltaStream is used by OdspDocumentService.ts to delay load the delta connection
 * as they are not on critical path of loading a container.
 */
export class OdspDelayLoadedDeltaStream {
	// Timer which runs and executes the join session call after intervals.
	private joinSessionRefreshTimer: ReturnType<typeof setTimeout> | undefined;

	private readonly joinSessionKey: string;

	private currentConnection?: OdspDocumentDeltaConnection;

	private _relayServiceTenantAndSessionId: string | undefined;

	/**
	 * @param odspResolvedUrl - resolved url identifying document that will be managed by this service instance.
	 * @param policies - Document service policies.
	 * @param getStorageToken - function that can provide the storage token. This is is also referred to as
	 * the "Vroom" token in SPO.
	 * @param getWebsocketToken - function that can provide a token for accessing the web socket. This is also referred
	 * to as the "Push" token in SPO. If undefined then websocket token is expected to be returned with joinSession
	 * response payload.
	 * @param mc - a logger that can capture performance and diagnostic information
	 * @param cache - This caches response for joinSession.
	 * @param hostPolicy - host constructed policy which customizes service behavior.
	 * @param epochTracker - This helper class which adds epoch to backend calls made by this service instance.
	 * @param opsReceived - To register the ops received through socket.
	 * @param socketReferenceKeyPrefix - (optional) prefix to isolate socket reuse cache
	 */
	public constructor(
		public readonly odspResolvedUrl: IOdspResolvedUrl,
		public policies: IDocumentServicePolicies,
		private readonly getStorageToken: InstrumentedStorageTokenFetcher,
		private readonly getWebsocketToken:
			| ((options: TokenFetchOptions) => Promise<string | null>)
			| undefined,
		private readonly mc: MonitoringContext,
		private readonly cache: IOdspCache,
		private readonly hostPolicy: HostStoragePolicy,
		private readonly epochTracker: EpochTracker,
		private readonly opsReceived: (ops: ISequencedDocumentMessage[]) => void,
		private readonly socketReferenceKeyPrefix?: string,
	) {
		this.joinSessionKey = getJoinSessionCacheKey(this.odspResolvedUrl);
	}

	public get resolvedUrl(): IResolvedUrl {
		return this.odspResolvedUrl;
	}

	public get currentDeltaConnection(): OdspDocumentDeltaConnection | undefined {
		return this.currentConnection;
	}

	public get relayServiceTenantAndSessionId(): string | undefined {
		return this._relayServiceTenantAndSessionId;
	}

	/** Annotate the given error indicating which connection step failed */
	private annotateConnectionError(
		error: any,
		failedConnectionStep: string,
		separateTokenRequest: boolean,
	): IFluidErrorBase {
		return normalizeError(error, {
			props: {
				failedConnectionStep,
				separateTokenRequest,
			},
		});
	}

	/**
	 * Connects to a delta stream endpoint for emitting ops.
	 *
	 * @returns returns the document delta stream service for onedrive/sharepoint driver.
	 */
	public async connectToDeltaStream(client: IClient): Promise<IDocumentDeltaConnection> {
		assert(
			this.currentConnection === undefined,
			0x4ad /* Should not be called when connection is already present! */,
		);
		// Attempt to connect twice, in case we used expired token.
		return getWithRetryForTokenRefresh<IDocumentDeltaConnection>(async (options) => {
			// Presence of getWebsocketToken callback dictates whether callback is used for fetching
			// websocket token or whether it is returned with joinSession response payload
			const requestWebsocketTokenFromJoinSession = this.getWebsocketToken === undefined;
			const websocketTokenPromise = requestWebsocketTokenFromJoinSession
				? Promise.resolve(null)
				: this.getWebsocketToken!(options);

			const annotateAndRethrowConnectionError = (step: string) => (error: any) => {
				throw this.annotateConnectionError(
					error,
					step,
					!requestWebsocketTokenFromJoinSession,
				);
			};

			const joinSessionPromise = this.joinSession(
				requestWebsocketTokenFromJoinSession,
				options,
				false /* isRefreshingJoinSession */,
			);
			const [websocketEndpoint, websocketToken] = await Promise.all([
				joinSessionPromise.catch(annotateAndRethrowConnectionError("joinSession")),
				websocketTokenPromise.catch(annotateAndRethrowConnectionError("getWebsocketToken")),
			]);

			const finalWebsocketToken = websocketToken ?? websocketEndpoint.socketToken ?? null;
			if (finalWebsocketToken === null) {
				throw this.annotateConnectionError(
					new NonRetryableError(
						"Websocket token is null",
						OdspErrorType.fetchTokenError,
						{ driverVersion },
					),
					"getWebsocketToken",
					!requestWebsocketTokenFromJoinSession,
				);
			}
			try {
				const connection = await this.createDeltaConnection(
					websocketEndpoint.tenantId,
					websocketEndpoint.id,
					finalWebsocketToken,
					client,
					websocketEndpoint.deltaStreamSocketUrl,
				);
				connection.on("op", (documentId, ops: ISequencedDocumentMessage[]) => {
					this.opsReceived(ops);
				});
				// On disconnect with 401/403 error code, we can just clear the joinSession cache as we will again
				// get the auth error on reconnecting and face latency.
				connection.once("disconnect", (error: any) => {
					// Clear the join session refresh timer so that it can be restarted on reconnection.
					this.clearJoinSessionTimer();
					if (
						typeof error === "object" &&
						error !== null &&
						error.errorType === DriverErrorType.authorizationError
					) {
						this.cache.sessionJoinCache.remove(this.joinSessionKey);
					}
					// If we hit this assert, it means that "disconnect" event is emitted before the connection went through
					// dispose flow which is not correct and could lead to a bunch of errors.
					assert(connection.disposed, 0x4ae /* Connection should be disposed by now */);
					this.currentConnection = undefined;
				});
				this.currentConnection = connection;
				return connection;
			} catch (error) {
				this.clearJoinSessionTimer();
				this.cache.sessionJoinCache.remove(this.joinSessionKey);

				const normalizedError = this.annotateConnectionError(
					error,
					"createDeltaConnection",
					!requestWebsocketTokenFromJoinSession,
				);
				if (typeof error === "object" && error !== null) {
					normalizedError.addTelemetryProperties({
						socketDocumentId: websocketEndpoint.id,
					});
				}
				throw normalizedError;
			}
		});
	}

	private clearJoinSessionTimer() {
		if (this.joinSessionRefreshTimer !== undefined) {
			clearTimeout(this.joinSessionRefreshTimer);
			this.joinSessionRefreshTimer = undefined;
		}
	}

	private async scheduleJoinSessionRefresh(
		delta: number,
		requestSocketToken: boolean,
		clientId: string | undefined,
	) {
		if (this.joinSessionRefreshTimer !== undefined) {
			this.clearJoinSessionTimer();
			const originalStackTraceLimit = (Error as any).stackTraceLimit;
			(Error as any).stackTraceLimit = 50;
			this.mc.logger.sendTelemetryEvent(
				{
					eventName: "DuplicateJoinSessionRefresh",
				},
				new Error("DuplicateJoinSessionRefresh"),
			);
			(Error as any).stackTraceLimit = originalStackTraceLimit;
		}

		await new Promise<void>((resolve, reject) => {
			this.joinSessionRefreshTimer = setTimeout(() => {
				this.clearJoinSessionTimer();
				// Clear the timer as it is going to be scheduled again as part of refreshing join session.
				getWithRetryForTokenRefresh(async (options) => {
					await this.joinSession(
						requestSocketToken,
						options,
						true /* isRefreshingJoinSession */,
						clientId,
					);
					resolve();
				}).catch((error) => {
					reject(error);
				});
			}, delta);
		});
	}

	private async joinSession(
		requestSocketToken: boolean,
		options: TokenFetchOptionsEx,
		isRefreshingJoinSession: boolean,
		clientId?: string,
	) {
		// If this call is to refresh the join session for the current connection but we are already disconnected in
		// the meantime or disconnected and then reconnected then do not make the call. However, we should not have
		// come here if that is the case because timer should have been disposed, but due to race condition with the
		// timer we should not make the call and throw error.
		if (
			isRefreshingJoinSession &&
			(this.currentConnection === undefined ||
				(clientId !== undefined && this.currentConnection.clientId !== clientId))
		) {
			this.clearJoinSessionTimer();
			throw new NonRetryableError(
				"JoinSessionRefreshTimerNotCancelled",
				DriverErrorType.genericError,
				{
					driverVersion,
					details: JSON.stringify({
						schedulerClientId: clientId,
						currentClientId: this.currentConnection?.clientId,
					}),
				},
			);
		}
		const response = await this.joinSessionCore(
			requestSocketToken,
			options,
			isRefreshingJoinSession,
		).catch((e) => {
			if (hasFacetCodes(e) && e.facetCodes !== undefined) {
				for (const code of e.facetCodes) {
					switch (code) {
						case "sessionForbidden":
						case "sessionForbiddenOnPreservedFiles":
						case "sessionForbiddenOnModerationEnabledLibrary":
						case "sessionForbiddenOnRequireCheckout":
						case "sessionForbiddenOnCheckoutFile":
						case "sessionForbiddenOnInvisibleMinorVersion":
							// This document can only be opened in storage-only mode.
							// DeltaManager will recognize this error
							// and load without a delta stream connection.
							this.policies = { ...this.policies, storageOnly: true };
							throw new DeltaStreamConnectionForbiddenError(
								`Storage-only due to ${code}`,
								{ driverVersion },
								code,
							);
						default:
							continue;
					}
				}
			}
			throw e;
		});
		this._relayServiceTenantAndSessionId = `${response.tenantId}/${response.id}`;
		return response;
	}

	private async joinSessionCore(
		requestSocketToken: boolean,
		options: TokenFetchOptionsEx,
		isRefreshingJoinSession: boolean,
	): Promise<ISocketStorageDiscovery> {
		const disableJoinSessionRefresh = this.mc.config.getBoolean(
			"Fluid.Driver.Odsp.disableJoinSessionRefresh",
		);
		const executeFetch = async () => {
			const joinSessionResponse = await fetchJoinSession(
				this.odspResolvedUrl,
				"opStream/joinSession",
				"POST",
				this.mc.logger,
				this.getStorageToken,
				this.epochTracker,
				requestSocketToken,
				options,
				disableJoinSessionRefresh,
				isRefreshingJoinSession,
				this.hostPolicy.sessionOptions?.unauthenticatedUserDisplayName,
			);
			return {
				entryTime: Date.now(),
				joinSessionResponse,
			};
		};

		const getResponseAndRefreshAfterDeltaMs = async () => {
			const _response = await this.cache.sessionJoinCache.addOrGet(
				this.joinSessionKey,
				executeFetch,
			);
			// If the response does not contain refreshSessionDurationSeconds, then treat it as old flow and let the
			// cache entry to be treated as expired after 1 hour.
			_response.joinSessionResponse.refreshSessionDurationSeconds =
				_response.joinSessionResponse.refreshSessionDurationSeconds ?? 3600;
			return {
				..._response,
				refreshAfterDeltaMs: this.calculateJoinSessionRefreshDelta(
					_response.entryTime,
					_response.joinSessionResponse.refreshSessionDurationSeconds,
				),
			};
		};
		let response = await getResponseAndRefreshAfterDeltaMs();
		// This means that the cached entry has expired(This should not be possible if the response is fetched
		// from the network call). In this case we remove the cached entry and fetch the new response.
		if (response.refreshAfterDeltaMs <= 0) {
			this.cache.sessionJoinCache.remove(this.joinSessionKey);
			response = await getResponseAndRefreshAfterDeltaMs();
		}
		if (!disableJoinSessionRefresh) {
			const props = {
				entryTime: response.entryTime,
				refreshSessionDurationSeconds:
					response.joinSessionResponse.refreshSessionDurationSeconds,
				refreshAfterDeltaMs: response.refreshAfterDeltaMs,
			};
			if (response.refreshAfterDeltaMs > 0) {
				this.scheduleJoinSessionRefresh(
					response.refreshAfterDeltaMs,
					requestSocketToken,
					this.currentConnection?.clientId,
				).catch((error) => {
					// Log the error and do nothing as the reconnection would fetch the join session.
					this.mc.logger.sendTelemetryEvent(
						{
							eventName: "JoinSessionRefreshError",
							details: JSON.stringify(props),
						},
						error,
					);
				});
			} else {
				// Logging just for informational purposes to help with debugging as this is a new feature.
				this.mc.logger.sendTelemetryEvent({
					eventName: "JoinSessionRefreshNotScheduled",
					details: JSON.stringify(props),
				});
			}
		}
		return response.joinSessionResponse;
	}

	private calculateJoinSessionRefreshDelta(
		responseFetchTime: number,
		refreshSessionDurationSeconds: number,
	) {
		// 30 seconds is buffer time to refresh the session.
		return responseFetchTime + (refreshSessionDurationSeconds * 1000 - 30000) - Date.now();
	}

	/**
	 * Creates a connection to the given delta stream endpoint
	 *
	 * @param tenantId - the ID of the tenant
	 * @param documentId - document ID
	 * @param token - authorization token for delta service
	 * @param client - information about the client
	 * @param webSocketUrl - websocket URL
	 */
	private async createDeltaConnection(
		tenantId: string,
		documentId: string,
		token: string | null,
		client: IClient,
		webSocketUrl: string,
	): Promise<OdspDocumentDeltaConnection> {
		const startTime = performance.now();
		const connection = await OdspDocumentDeltaConnection.create(
			tenantId,
			documentId,
			token,
			client,
			webSocketUrl,
			this.mc.logger,
			60000,
			this.epochTracker,
			this.socketReferenceKeyPrefix,
		);
		const duration = performance.now() - startTime;
		// This event happens rather often, so it adds up to cost of telemetry.
		// Given that most reconnects result in reusing socket and happen very quickly,
		// report event only if it took longer than threshold.
		if (duration >= 2000) {
			this.mc.logger.sendPerformanceEvent({
				eventName: "ConnectionSuccess",
				duration,
			});
		}
		return connection;
	}

	public dispose(error?: any) {
		this.clearJoinSessionTimer();
		this.currentConnection?.dispose();
		this.currentConnection = undefined;
	}
}
