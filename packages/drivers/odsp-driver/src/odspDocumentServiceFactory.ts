/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IDocumentService,
	IDocumentServiceFactory,
	IPersistedCache,
	IResolvedUrl,
} from "@fluidframework/driver-definitions/internal";
import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import type {
	HostStoragePolicy,
	OdspResourceTokenFetchOptions,
	TokenFetcher,
} from "@fluidframework/odsp-driver-definitions/internal";

// eslint-disable-next-line import-x/no-internal-modules
import { LocalOdspDocumentServiceFactory } from "./localOdspDriver/localOdspDocumentServiceFactory.js";
import { OdspDocumentServiceFactoryCore } from "./odspDocumentServiceFactoryCore.js";

/**
 * An ODSP document service factory that supports point-in-time (sequence-number-based) loading.
 *
 * @remarks
 * The loader detects this capability structurally, so hosts can pass this factory directly to
 * {@link @fluidframework/container-loader#loadContainerToSequenceNumber}.
 *
 * @legacy @beta
 */
export interface IPointInTimeDocumentServiceFactory extends IDocumentServiceFactory {
	/**
	 * Creates a document service that materializes the document at the requested sequence number.
	 *
	 * @param resolvedUrl - The resolved ODSP {@link @fluidframework/driver-definitions#IResolvedUrl}.
	 * @param targetSequenceNumber - The sequence number at which to materialize the document. See
	 * {@link @fluidframework/container-loader#ILoadContainerToSequenceNumberProps.loadToSequenceNumber}.
	 * @param logger - Optional {@link @fluidframework/core-interfaces#ITelemetryBaseLogger}.
	 * @param clientIsSummarizer - Whether to apply summarizer policies and telemetry to the
	 * underlying document services. Defaults to `false`.
	 * @returns A read-only {@link @fluidframework/driver-definitions#IDocumentService} materialized
	 * at the requested sequence number.
	 */
	createPointInTimeDocumentService(
		resolvedUrl: IResolvedUrl,
		targetSequenceNumber: number,
		logger?: ITelemetryBaseLogger,
		clientIsSummarizer?: boolean,
	): Promise<IDocumentService>;
}

/**
 * Factory for creating the sharepoint document service. Use this if you want to
 * use the sharepoint implementation.
 * @legacy
 * @beta
 */
export class OdspDocumentServiceFactory
	extends OdspDocumentServiceFactoryCore
	implements IPointInTimeDocumentServiceFactory
{
	private readonly pointInTimeStorageTokenFetcher: TokenFetcher<OdspResourceTokenFetchOptions>;

	constructor(
		getStorageToken: TokenFetcher<OdspResourceTokenFetchOptions>,
		getWebsocketToken: TokenFetcher<OdspResourceTokenFetchOptions> | undefined,
		persistedCache?: IPersistedCache,
		hostPolicy?: HostStoragePolicy,
	) {
		super(getStorageToken, getWebsocketToken, persistedCache, hostPolicy);
		this.pointInTimeStorageTokenFetcher = getStorageToken;
	}

	/**
	 * Creates a document service that materializes the document at the requested sequence number.
	 *
	 * @param resolvedUrl - The resolved ODSP {@link @fluidframework/driver-definitions#IResolvedUrl}.
	 * @param targetSequenceNumber - The sequence number at which to materialize the document. See
	 * {@link @fluidframework/container-loader#ILoadContainerToSequenceNumberProps.loadToSequenceNumber}.
	 * @param logger - Optional {@link @fluidframework/core-interfaces#ITelemetryBaseLogger}.
	 * @param clientIsSummarizer - Whether to apply summarizer policies and telemetry to the
	 * underlying document services. Defaults to `false`.
	 * @returns A read-only {@link @fluidframework/driver-definitions#IDocumentService} materialized
	 * at the requested sequence number.
	 */
	public async createPointInTimeDocumentService(
		resolvedUrl: IResolvedUrl,
		targetSequenceNumber: number,
		logger?: ITelemetryBaseLogger,
		clientIsSummarizer?: boolean,
	): Promise<IDocumentService> {
		const { createPointInTimeDocumentService } = await import(
			// eslint-disable-next-line import-x/no-internal-modules -- direct import keeps all PIT implementation behind one lazy boundary
			/* webpackChunkName: "odspPointInTime" */ "./pointInTimeDriver/createPointInTimeDocumentService.js"
		);
		return createPointInTimeDocumentService({
			resolvedUrl,
			targetSequenceNumber,
			logger,
			clientIsSummarizer,
			persistedCache: this.persistedCache,
			getStorageToken: this.pointInTimeStorageTokenFetcher,
			createDocumentService: async (url, odspLogger, cacheAndTracker, isSummarizer) =>
				this.createDocumentServiceCore(url, odspLogger, cacheAndTracker, isSummarizer),
		});
	}
}

/**
 * Creates an ODSP document service factory that supports point-in-time loading.
 *
 * @param getStorageToken - Fetches storage access tokens.
 * @param getWebsocketToken - Fetches websocket access tokens, or `undefined` when unavailable.
 * @param persistedCache - Persisted ODSP cache. When omitted, a local in-memory cache is used.
 * @param hostPolicy - Host storage policy. When omitted, the default driver policies are used.
 * @returns An ODSP document service factory with point-in-time loading capability.
 *
 * @deprecated Use {@link OdspDocumentServiceFactory} directly. This compatibility alias will be
 * removed in a future major release.
 *
 * @legacy @beta
 */
export function getOdspPointInTimeDocumentServiceFactory(
	getStorageToken: TokenFetcher<OdspResourceTokenFetchOptions>,
	getWebsocketToken: TokenFetcher<OdspResourceTokenFetchOptions> | undefined,
	persistedCache?: IPersistedCache,
	hostPolicy?: HostStoragePolicy,
): IPointInTimeDocumentServiceFactory {
	return new OdspDocumentServiceFactory(
		getStorageToken,
		getWebsocketToken,
		persistedCache,
		hostPolicy,
	);
}

/**
 * Creates a factory instance for creating a sharepoint document service from a provided snapshot.
 *
 * @remarks Use if you don't want to connect to any kind of external/internal storages and want to provide
 * content directly.
 *
 * @legacy
 * @beta
 */
export function createLocalOdspDocumentServiceFactory(
	localSnapshot: Uint8Array | string,
): IDocumentServiceFactory {
	return new LocalOdspDocumentServiceFactory(localSnapshot);
}
