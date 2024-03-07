/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils";
import { UsageError } from "@fluidframework/driver-utils";
import { ISnapshot } from "@fluidframework/driver-definitions";
import {
	IFileEntry,
	InstrumentedStorageTokenFetcher,
	IOdspResolvedUrl,
} from "@fluidframework/odsp-driver-definitions";
import { IWriteSummaryResponse } from "./contracts.js";
import { createCacheSnapshotKey, getOrigin, IExistingFileInfo } from "./odspUtils.js";
import { createOdspUrl } from "./createOdspUrl.js";
import { getApiRoot } from "./odspUrlHelper.js";
import { EpochTracker } from "./epochTracker.js";
import { OdspDriverUrlResolver } from "./odspDriverUrlResolver.js";
import {
	convertCreateNewSummaryTreeToTreeAndBlobs,
	convertSummaryIntoContainerSnapshot,
	createNewFluidContainerCore,
} from "./createNewUtils.js";
import { ClpCompliantAppHeader } from "./contractsPublic.js";

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
	getStorageToken: InstrumentedStorageTokenFetcher,
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

	const baseUrl = `${getApiRoot(getOrigin(fileInfo.siteUrl))}/drives/${fileInfo.driveId}/items/${
		fileInfo.itemId
	}`;

	const containerSnapshot = convertSummaryIntoContainerSnapshot(createNewSummary);

	const initialUrl = `${baseUrl}/opStream/snapshots/snapshot`;

	const { id: summaryHandle } = await createNewFluidContainerCore<IWriteSummaryResponse>({
		containerSnapshot,
		getStorageToken,
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
		await epochTracker.put(createCacheSnapshotKey(odspResolvedUrl), snapshot);
	}

	return odspResolvedUrl;
}
