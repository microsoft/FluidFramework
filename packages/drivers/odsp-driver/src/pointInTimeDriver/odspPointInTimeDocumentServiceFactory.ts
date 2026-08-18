/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import type {
	IDocumentService,
	IDocumentServiceFactory,
	IPersistedCache,
	IResolvedUrl,
} from "@fluidframework/driver-definitions/internal";
import type {
	HostStoragePolicy,
	IOdspResolvedUrl,
	IOdspUrlParts,
	OdspResourceTokenFetchOptions,
	TokenFetcher,
} from "@fluidframework/odsp-driver-definitions/internal";
import {
	UsageError,
	createChildLogger,
	type TelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";

import { createOdspCacheAndTracker, type EpochTracker } from "../epochTracker.js";
import { NonPersistentCache } from "../odspCache.js";
import { OdspDocumentServiceFactoryCore } from "../odspDocumentServiceFactoryCore.js";
import { OdspDriverUrlResolver } from "../odspDriverUrlResolver.js";
import {
	createOdspLogger,
	getOdspResolvedUrl,
	toInstrumentedOdspStorageTokenFetcher,
} from "../odspUtils.js";
import {
	createOdspVersionManager,
	type IOdspVersionManager,
} from "../odspVersionManager/index.js";

import { OdspPointInTimeDocumentService } from "./odspPointInTimeDocumentService.js";

/**
 * An ODSP document service factory that supports point-in-time (sequence-number-based) loading.
 *
 * @remarks
 * The loader detects this capability structurally, so hosts can pass this factory directly to
 * `loadContainerToSequenceNumber`.
 *
 * @legacy @beta
 */
export interface IPointInTimeDocumentServiceFactory extends IDocumentServiceFactory {
	/**
	 * Creates a document service that materializes the document at the requested sequence number.
	 *
	 * @param resolvedUrl - The resolved ODSP document URL.
	 * @param targetSequenceNumber - The sequence number at which to materialize the document.
	 * @param logger - Optional telemetry logger.
	 * @param clientIsSummarizer - Whether the requesting client is a summarizer.
	 * @returns A read-only document service materialized at the requested sequence number.
	 */
	createPointInTimeDocumentService(
		resolvedUrl: IResolvedUrl,
		targetSequenceNumber: number,
		logger?: ITelemetryBaseLogger,
		clientIsSummarizer?: boolean,
	): Promise<IDocumentService>;
}

class OdspPointInTimeDocumentServiceFactory
	extends OdspDocumentServiceFactoryCore
	implements IPointInTimeDocumentServiceFactory
{
	/**
	 * The storage token fetcher, captured here because the base class keeps it private.
	 */
	private readonly getStorageTokenForVersions: TokenFetcher<OdspResourceTokenFetchOptions>;

	/**
	 * Creates a point-in-time-capable ODSP document service factory.
	 *
	 * @param getStorageToken - Fetches storage access tokens.
	 * @param getWebsocketToken - Fetches websocket access tokens, or `undefined` when unavailable.
	 * @param persistedCache - Optional persisted ODSP cache.
	 * @param hostPolicy - Optional host storage policy.
	 */
	constructor(
		getStorageToken: TokenFetcher<OdspResourceTokenFetchOptions>,
		getWebsocketToken: TokenFetcher<OdspResourceTokenFetchOptions> | undefined,
		persistedCache?: IPersistedCache,
		hostPolicy?: HostStoragePolicy,
	) {
		super(getStorageToken, getWebsocketToken, persistedCache, hostPolicy);
		this.getStorageTokenForVersions = getStorageToken;
	}

	/**
	 * Creates a document service that reads its snapshot from the closest file version at or before
	 * the target and its deltas from the live document, materializing a requested sequence number
	 * through replay.
	 *
	 * @param resolvedUrl - The resolved ODSP document URL.
	 * @param targetSequenceNumber - The sequence number at which to materialize the document.
	 * @param logger - Optional telemetry logger.
	 * @param clientIsSummarizer - Whether the requesting client is a summarizer.
	 * @returns A read-only document service materialized at the requested sequence number.
	 */
	public async createPointInTimeDocumentService(
		resolvedUrl: IResolvedUrl,
		targetSequenceNumber: number,
		logger?: ITelemetryBaseLogger,
		clientIsSummarizer?: boolean,
	): Promise<IDocumentService> {
		const odspLogger = createOdspLogger(logger);
		const extLogger = createChildLogger({ logger: odspLogger });
		const odspResolvedUrl = getOdspResolvedUrl(resolvedUrl);

		// Build ONE cache-and-tracker and thread its EpochTracker through every read this method
		// makes: the version-history reads that pick the base, the recoverable base snapshot, and the
		// live op stream. This shared tracker IS the lineage guard.
		//
		// ODSP stamps each response with the file's epoch; an EpochTracker instance pins itself to the
		// first epoch it sees and throws on any later divergence (see setEpoch / checkForEpochError in
		// epochTracker.ts).
		//
		// A fresh NonPersistentCache keeps this read-only historical load isolated from the factory's
		// shared cache, so a base file version's snapshot can never leak into a normal live load.
		const cacheAndTracker = createOdspCacheAndTracker(
			this.persistedCache,
			new NonPersistentCache(),
			{
				resolvedUrl: odspResolvedUrl,
				docId: odspResolvedUrl.hashedDocumentId,
				fileVersion: odspResolvedUrl.fileVersion,
			},
			extLogger,
			clientIsSummarizer,
		);

		const versionManager = this.createVersionManager(
			odspResolvedUrl,
			extLogger,
			cacheAndTracker.epochTracker,
		);
		const baseResult = await versionManager.findBaseForSeq(targetSequenceNumber);
		if (baseResult.kind === "noBaseVersion") {
			const oldestResolvedSequenceDetail =
				baseResult.oldestResolvedSeq === undefined
					? ""
					: ` The oldest resolved file version is at sequence number ${baseResult.oldestResolvedSeq}.`;
			throw new UsageError(
				`No ODSP file version is available at or before sequence number ${targetSequenceNumber}.${oldestResolvedSequenceDetail}`,
			);
		}

		const recoverableResolvedUrl = await this.resolveFileVersion(
			resolvedUrl,
			baseResult.base.versionId,
		);
		// Both services are created via createDocumentServiceCore with the shared cacheAndTracker, so
		// their reads validate against the same epoch - see the lineage-guard note above.
		const recoverableDocumentService = await this.createDocumentServiceCore(
			recoverableResolvedUrl,
			odspLogger,
			cacheAndTracker,
			clientIsSummarizer,
		);
		const liveDocumentService = await this.createDocumentServiceCore(
			resolvedUrl,
			odspLogger,
			cacheAndTracker,
			clientIsSummarizer,
		);
		return new OdspPointInTimeDocumentService(
			recoverableResolvedUrl,
			recoverableDocumentService,
			liveDocumentService,
			targetSequenceNumber,
		);
	}

	/**
	 * Builds an IOdspVersionManager for the given file, which enumerates the file's stored
	 * versions and resolves the closest version at or before a target sequence number.
	 *
	 * @remarks
	 * The caller passes in the shared {@link EpochTracker} so the version-history reads validate
	 * against the same epoch as the recoverable and live document services - this is the lineage
	 * guard used by `createPointInTimeDocumentService`.
	 * The manager itself only needs the URL parts and an instrumented storage-token/auth-header
	 * fetcher wired to that tracker.
	 */
	private createVersionManager(
		odspResolvedUrl: IOdspResolvedUrl,
		logger: TelemetryLoggerExt,
		epochTracker: EpochTracker,
	): IOdspVersionManager {
		const urlParts: IOdspUrlParts = {
			siteUrl: odspResolvedUrl.siteUrl,
			driveId: odspResolvedUrl.driveId,
			itemId: odspResolvedUrl.itemId,
		};
		const getAuthHeader = toInstrumentedOdspStorageTokenFetcher(
			logger,
			urlParts,
			this.getStorageTokenForVersions,
		);
		return createOdspVersionManager({
			urlParts,
			getAuthHeader,
			epochTracker,
			logger,
		});
	}

	private async resolveFileVersion(
		resolvedUrl: IResolvedUrl,
		fileVersion: string,
	): Promise<IResolvedUrl> {
		const odspResolvedUrl = getOdspResolvedUrl(resolvedUrl);
		const query = new URLSearchParams({
			driveId: odspResolvedUrl.driveId,
			itemId: odspResolvedUrl.itemId,
			fileVersion,
		});
		if (odspResolvedUrl.dataStorePath !== undefined) {
			query.set("path", odspResolvedUrl.dataStorePath);
		}
		if (odspResolvedUrl.codeHint?.containerPackageName !== undefined) {
			query.set("containerPackageName", odspResolvedUrl.codeHint.containerPackageName);
		}
		return new OdspDriverUrlResolver().resolve({
			url: `${odspResolvedUrl.siteUrl}?${query.toString()}`,
		});
	}
}

/**
 * Creates an ODSP document service factory that supports point-in-time loading.
 *
 * @param getStorageToken - Fetches storage access tokens.
 * @param getWebsocketToken - Fetches websocket access tokens, or `undefined` when unavailable.
 * @param persistedCache - Optional persisted ODSP cache.
 * @param hostPolicy - Optional host storage policy.
 * @returns An ODSP document service factory with point-in-time loading capability.
 *
 * @legacy @beta
 */
export function getOdspPointInTimeDocumentServiceFactory(
	getStorageToken: TokenFetcher<OdspResourceTokenFetchOptions>,
	getWebsocketToken: TokenFetcher<OdspResourceTokenFetchOptions> | undefined,
	persistedCache?: IPersistedCache,
	hostPolicy?: HostStoragePolicy,
): IPointInTimeDocumentServiceFactory {
	return new OdspPointInTimeDocumentServiceFactory(
		getStorageToken,
		getWebsocketToken,
		persistedCache,
		hostPolicy,
	);
}
