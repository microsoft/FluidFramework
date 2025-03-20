/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISummaryTree } from "@fluidframework/driver-definitions";
import { ISnapshot } from "@fluidframework/driver-definitions/internal";
import { UsageError } from "@fluidframework/driver-utils/internal";
import {
	IFileEntry,
	IOdspResolvedUrl,
	InstrumentedStorageTokenFetcher,
} from "@fluidframework/odsp-driver-definitions/internal";
import {
	ITelemetryLoggerExt,
	loggerToMonitoringContext,
} from "@fluidframework/telemetry-utils/internal";

import { IWriteSummaryResponse } from "./../contracts.js";
import { ClpCompliantAppHeader } from "./../contractsPublic.js";
import { createOdspUrl } from "./../createOdspUrl.js";
import { EpochTracker } from "./../epochTracker.js";
import { OdspDriverUrlResolver } from "./../odspDriverUrlResolver.js";
import { getApiRoot } from "./../odspUrlHelper.js";
import {
	IExistingFileInfo,
	createCacheSnapshotKey,
	snapshotWithLoadingGroupIdSupported,
} from "./../odspUtils.js";
import {
	convertCreateNewSummaryTreeToTreeAndBlobs,
	convertSummaryIntoContainerSnapshot,
	createNewFluidContainerCore,
} from "./createNewUtils.js";

/**
 * Creates a new Fluid container on an existing file.
 *
 * @remarks This requires service's capability to manage Fluid container inside an existing file.
 *
 * @example
 *
 * This enables a scenario where Fluid data is not stored as a standalone file but in a way that is managed
 * by an existing file. For example, SharePoint Pages is able to store Fluid container in an
 * "alternative file partition" where the main File stub is an ASPX page.
 */
export async function createNewContainerOnExistingFile(
	getAuthHeader: InstrumentedStorageTokenFetcher,
	fileInfo: IExistingFileInfo,
	logger: ITelemetryLoggerExt,
	createNewSummary: ISummaryTree | undefined,
	epochTracker: EpochTracker,
	fileEntry: IFileEntry,
	createNewCaching: boolean,
	forceAccessTokenViaAuthorizationHeader: boolean,
	isClpCompliantApp?: boolean,
): Promise<IOdspResolvedUrl> {
	if (createNewSummary === undefined) {
		throw new UsageError("createNewSummary must exist to create a new container");
	}

	const baseUrl = `${getApiRoot(new URL(fileInfo.siteUrl))}/drives/${fileInfo.driveId}/items/${
		fileInfo.itemId
	}`;

	const containerSnapshot = convertSummaryIntoContainerSnapshot(createNewSummary);

	const initialUrl = `${baseUrl}/opStream/snapshots/snapshot`;

	const { id: summaryHandle } = await createNewFluidContainerCore<IWriteSummaryResponse>({
		containerSnapshot,
		getAuthHeader,
		logger,
		initialUrl,
		forceAccessTokenViaAuthorizationHeader,
		epochTracker,
		telemetryName: "CreateNewContainerOnExistingFile",
		fetchType: "uploadSummary",
	});

	const odspUrl = createOdspUrl({ ...fileInfo, dataStorePath: "/" });
	const resolver = new OdspDriverUrlResolver();
	const odspResolvedUrl = await resolver.resolve({
		url: odspUrl,
		headers: { [ClpCompliantAppHeader.isClpCompliantApp]: isClpCompliantApp },
	});
	fileEntry.docId = odspResolvedUrl.hashedDocumentId;
	fileEntry.resolvedUrl = odspResolvedUrl;

	if (createNewCaching) {
		// converting summary and getting sequence number
		const snapshot: ISnapshot = convertCreateNewSummaryTreeToTreeAndBlobs(
			createNewSummary,
			summaryHandle,
		);
		// caching the converted summary
		await epochTracker.put(
			createCacheSnapshotKey(
				odspResolvedUrl,
				snapshotWithLoadingGroupIdSupported(loggerToMonitoringContext(logger).config),
			),
			snapshot,
		);
	}

	return odspResolvedUrl;
}
