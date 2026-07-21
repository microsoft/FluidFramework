/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import type {
	IDocumentService,
	IPersistedCache,
	IResolvedUrl,
} from "@fluidframework/driver-definitions/internal";
import type {
	HostStoragePolicy,
	IOdspUrlParts,
	OdspResourceTokenFetchOptions,
	TokenFetcher,
} from "@fluidframework/odsp-driver-definitions/internal";
import { UsageError, createChildLogger } from "@fluidframework/telemetry-utils/internal";

import { createOdspCacheAndTracker } from "../epochTracker.js";
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
 * ODSP document service factory that additionally supports point-in-time (sequence-number-based)
 * loading.
 *
 * @remarks
 * This extends {@link OdspDocumentServiceFactoryCore} with the ability to materialize a read-only
 * document service at a requested Fluid sequence number. The loader detects this capability via the
 * presence of {@link OdspPointInTimeDocumentServiceFactory.createPointInTimeDocumentService}, so
 * hosts that want to load a container to a target sequence number must construct this factory
 * (rather than the legacy `OdspDocumentServiceFactory`) and pass it to the loader.
 *
 * @internal
 */
export class OdspPointInTimeDocumentServiceFactory extends OdspDocumentServiceFactoryCore {
	/**
	 * The storage token fetcher, captured here because the base class keeps it private.
	 */
	private readonly getStorageTokenForVersions: TokenFetcher<OdspResourceTokenFetchOptions>;

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
	 * Creates a point-in-time document service: a read-only IDocumentService that
	 * materializes the document as it was at `targetSequenceNumber`.
	 *
	 * @remarks
	 * "Point-in-time" is the overall result. It is assembled from two underlying document services,
	 * which is why the terms differ:
	 * - the *closest-version* service - opened against the closest ODSP file version at or before the
	 * target - provides the base snapshot, and
	 * - the *live* service - opened against the current document - provides the deltas that are
	 * replayed on top of that snapshot up to the target.
	 */
	public async createPointInTimeDocumentService(
		resolvedUrl: IResolvedUrl,
		targetSequenceNumber: number,
		logger?: ITelemetryBaseLogger,
		clientIsSummarizer?: boolean,
	): Promise<IDocumentService> {
		// The version manager knows the file's ODSP versions (checkpoints); ask it for the closest
		// one at or before the target to use as the base snapshot.
		const versionManager = await this.createVersionManager(
			resolvedUrl,
			logger,
			clientIsSummarizer,
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

		// The service for the closest version: a document service pinned to the file version selected
		// above. It supplies the base snapshot (storage) at or before the target - the starting point
		// for replay.
		const closestVersionResolvedUrl = await this.resolveFileVersion(
			resolvedUrl,
			baseResult.base.versionId,
		);
		const closestVersionDocumentService = await this.createDocumentService(
			closestVersionResolvedUrl,
			logger,
			clientIsSummarizer,
		);
		// Live: a document service against the current document. Only its delta storage is used, to
		// replay ops from the closest version's snapshot sequence number up to the target.
		const liveDocumentService = await this.createDocumentService(
			resolvedUrl,
			logger,
			clientIsSummarizer,
		);
		return new OdspPointInTimeDocumentService(
			closestVersionResolvedUrl,
			closestVersionDocumentService,
			liveDocumentService,
			targetSequenceNumber,
		);
	}

	/**
	 * Builds an {@link IOdspVersionManager} for the file identified by `resolvedUrl`.
	 *
	 * @remarks
	 * The version manager enumerates the file's ODSP versions (checkpoints) and, given a target
	 * sequence number, selects the closest version at or before it - i.e. the base snapshot the
	 * point-in-time service replays ops on top of (see createPointInTimeDocumentService). It is
	 * exposed so callers (and tests) can drive the same technique the service uses internally:
	 * enumerate versions with `listVersions()` and pick a base with `findBaseForSeq(target)`.
	 * This method just wires up the dependencies it needs: a child logger, the site/drive/item URL
	 * parts, an epoch tracker and an instrumented storage-token auth-header fetcher.
	 */
	public async createVersionManager(
		resolvedUrl: IResolvedUrl,
		logger?: ITelemetryBaseLogger,
		clientIsSummarizer?: boolean,
	): Promise<IOdspVersionManager> {
		const odspLogger = createOdspLogger(logger);
		const extLogger = createChildLogger({ logger: odspLogger });
		const odspResolvedUrl = getOdspResolvedUrl(resolvedUrl);
		const urlParts: IOdspUrlParts = {
			siteUrl: odspResolvedUrl.siteUrl,
			driveId: odspResolvedUrl.driveId,
			itemId: odspResolvedUrl.itemId,
		};
		// Only the epochTracker from the returned cacheAndTracker is used below, so a fresh
		// NonPersistentCache is sufficient here.
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
		const getAuthHeader = toInstrumentedOdspStorageTokenFetcher(
			extLogger,
			urlParts,
			this.getStorageTokenForVersions,
		);
		return createOdspVersionManager({
			urlParts,
			getAuthHeader,
			epochTracker: cacheAndTracker.epochTracker,
			logger: extLogger,
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
