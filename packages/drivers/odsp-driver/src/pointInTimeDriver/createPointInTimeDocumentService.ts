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
import type { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions/internal";
import {
	UsageError,
	createChildLogger,
	type TelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";

import {
	createOdspCacheAndTracker,
	type EpochTracker,
	type ICacheAndTracker,
} from "../epochTracker.js";
import { NonPersistentCache } from "../odspCache.js";
import { getApiRoot } from "../odspUrlHelper.js";
import { createOdspLogger, getOdspResolvedUrl } from "../odspUtils.js";
import type { IOdspVersionManager } from "../odspVersionManager/index.js";

import { OdspPointInTimeDocumentService } from "./odspPointInTimeDocumentService.js";

interface ICreatePointInTimeDocumentServiceProps {
	resolvedUrl: IResolvedUrl;
	targetSequenceNumber: number;
	logger?: ITelemetryBaseLogger;
	clientIsSummarizer?: boolean;
	persistedCache: IPersistedCache;
	createVersionManager: (
		odspResolvedUrl: IOdspResolvedUrl,
		logger: TelemetryLoggerExt,
		epochTracker: EpochTracker,
	) => Promise<IOdspVersionManager>;
	resolveFileVersion: (
		resolvedUrl: IResolvedUrl,
		fileVersion: string,
	) => Promise<IResolvedUrl>;
	createDocumentService: (
		resolvedUrl: IResolvedUrl,
		logger: ITelemetryBaseLogger,
		cacheAndTracker: ICacheAndTracker,
		clientIsSummarizer?: boolean,
	) => Promise<IDocumentService>;
}

export function resolveFileVersion(
	resolvedUrl: IResolvedUrl,
	fileVersion: string,
): IOdspResolvedUrl {
	const odspResolvedUrl = getOdspResolvedUrl(resolvedUrl);
	const urlBase = `${getApiRoot(new URL(odspResolvedUrl.siteUrl))}/drives/${
		odspResolvedUrl.driveId
	}/items/${odspResolvedUrl.itemId}/versions/${fileVersion}/`;
	return {
		...odspResolvedUrl,
		endpoints: {
			snapshotStorageUrl: `${urlBase}opStream/snapshots`,
			attachmentPOSTStorageUrl: `${urlBase}opStream/attachment`,
			attachmentGETStorageUrl: `${urlBase}opStream/attachments`,
			deltaStorageUrl: `${urlBase}opStream`,
		},
		fileVersion,
	};
}

export async function createPointInTimeDocumentService({
	resolvedUrl,
	targetSequenceNumber,
	logger,
	clientIsSummarizer,
	persistedCache,
	createVersionManager,
	resolveFileVersion: resolveFileVersionForService,
	createDocumentService,
}: ICreatePointInTimeDocumentServiceProps): Promise<IDocumentService> {
	const odspLogger = createOdspLogger(logger);
	const extLogger = createChildLogger({ logger: odspLogger });
	const odspResolvedUrl = getOdspResolvedUrl(resolvedUrl);

	// Use one epoch tracker for version selection, the base snapshot, and live ops so a
	// point-in-time load cannot combine data from different file lineages.
	const cacheAndTracker = createOdspCacheAndTracker(
		persistedCache,
		new NonPersistentCache(),
		{
			resolvedUrl: odspResolvedUrl,
			docId: odspResolvedUrl.hashedDocumentId,
			fileVersion: odspResolvedUrl.fileVersion,
		},
		extLogger,
		clientIsSummarizer,
	);

	const versionManager = await createVersionManager(
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

	const recoverableResolvedUrl = await resolveFileVersionForService(
		resolvedUrl,
		baseResult.base.versionId,
	);
	// Keep historical snapshots isolated from the normal factory cache while validating both
	// services against the shared tracker.
	const recoverableDocumentService = await createDocumentService(
		recoverableResolvedUrl,
		odspLogger,
		cacheAndTracker,
		clientIsSummarizer,
	);
	const liveDocumentService = await createDocumentService(
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
