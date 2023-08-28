/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { NonRetryableError } from "@fluidframework/driver-utils";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { ITelemetryLoggerExt, PerformanceEvent } from "@fluidframework/telemetry-utils";
import {
	InstrumentedStorageTokenFetcher,
	IOdspResolvedUrl,
	OdspErrorType,
	ShareLinkInfoType,
	ISharingLinkKind,
	ShareLinkTypes,
	IFileEntry,
} from "@fluidframework/odsp-driver-definitions";
import { DriverErrorType } from "@fluidframework/driver-definitions";
import { ICreateFileResponse } from "./contracts";
import { getUrlAndHeadersWithAuth } from "./getUrlAndHeadersWithAuth";
import {
	buildOdspShareLinkReqParams,
	createCacheSnapshotKey,
	getWithRetryForTokenRefresh,
	INewFileInfo,
	getOrigin,
} from "./odspUtils";
import { ISnapshotContents } from "./odspPublicUtils";
import { createOdspUrl } from "./createOdspUrl";
import { getApiRoot } from "./odspUrlHelper";
import { EpochTracker } from "./epochTracker";
import { OdspDriverUrlResolver } from "./odspDriverUrlResolver";
import {
	convertCreateNewSummaryTreeToTreeAndBlobs,
	convertSummaryIntoContainerSnapshot,
	createNewFluidContainerCore,
} from "./createNewUtils";
import { runWithRetry } from "./retryUtils";
import { pkgVersion as driverVersion } from "./packageVersion";
import { ClpCompliantAppHeader } from "./contractsPublic";

const isInvalidFileName = (fileName: string): boolean => {
	const invalidCharsRegex = /["*/:<>?\\|]+/g;
	return !!fileName.match(invalidCharsRegex);
};

/**
 * Creates a new Fluid file.
 * Returns resolved url
 */
export async function createNewFluidFile(
	getStorageToken: InstrumentedStorageTokenFetcher,
	newFileInfo: INewFileInfo,
	logger: ITelemetryLoggerExt,
	createNewSummary: ISummaryTree | undefined,
	epochTracker: EpochTracker,
	fileEntry: IFileEntry,
	createNewCaching: boolean,
	forceAccessTokenViaAuthorizationHeader: boolean,
	isClpCompliantApp?: boolean,
	enableSingleRequestForShareLinkWithCreate?: boolean,
	enableShareLinkWithCreate?: boolean,
): Promise<IOdspResolvedUrl> {
	// Check for valid filename before the request to create file is actually made.
	if (isInvalidFileName(newFileInfo.filename)) {
		throw new NonRetryableError(
			// pre-0.58 error message: Invalid filename
			"Invalid filename for createNew",
			OdspErrorType.invalidFileNameError,
			{ driverVersion },
		);
	}

	let itemId: string;
	let summaryHandle: string = "";
	let shareLinkInfo: ShareLinkInfoType | undefined;
	if (createNewSummary === undefined) {
		itemId = await createNewEmptyFluidFile(
			getStorageToken,
			newFileInfo,
			logger,
			epochTracker,
			forceAccessTokenViaAuthorizationHeader,
		);
	} else {
		const content = await createNewFluidFileFromSummary(
			getStorageToken,
			newFileInfo,
			logger,
			createNewSummary,
			epochTracker,
			forceAccessTokenViaAuthorizationHeader,
		);
		itemId = content.itemId;
		summaryHandle = content.id;

		shareLinkInfo = extractShareLinkData(
			newFileInfo.createLinkType,
			content,
			enableSingleRequestForShareLinkWithCreate,
			enableShareLinkWithCreate,
		);
	}

	const odspUrl = createOdspUrl({ ...newFileInfo, itemId, dataStorePath: "/" });
	const resolver = new OdspDriverUrlResolver();
	const odspResolvedUrl = await resolver.resolve({
		url: odspUrl,
		headers: { [ClpCompliantAppHeader.isClpCompliantApp]: isClpCompliantApp },
	});
	fileEntry.docId = odspResolvedUrl.hashedDocumentId;
	fileEntry.resolvedUrl = odspResolvedUrl;

	odspResolvedUrl.shareLinkInfo = shareLinkInfo;

	if (createNewSummary !== undefined && createNewCaching) {
		assert(summaryHandle !== undefined, 0x203 /* "Summary handle is undefined" */);
		// converting summary and getting sequence number
		const snapshot: ISnapshotContents = convertCreateNewSummaryTreeToTreeAndBlobs(
			createNewSummary,
			summaryHandle,
		);
		// caching the converted summary
		await epochTracker.put(createCacheSnapshotKey(odspResolvedUrl), snapshot);
	}
	return odspResolvedUrl;
}

/**
 * If user requested creation of a sharing link along with the creation of the file by providing either
 * createLinkType (now deprecated) or createLinkScope in the request parameters, extract and save
 * sharing link information from the response if it is available.
 * In case there was an error in creation of the sharing link, error is provided back in the response,
 * and does not impact the creation of file in ODSP.
 * @param requestedSharingLinkKind - Kind of sharing link requested to be created along with the creation of file.
 * @param response - Response object received from the /snapshot api call
 * @returns Sharing link information received in the response from a successful creation of a file.
 */
function extractShareLinkData(
	requestedSharingLinkKind: ShareLinkTypes | ISharingLinkKind | undefined,
	response: ICreateFileResponse,
	enableSingleRequestForShareLinkWithCreate?: boolean,
	enableShareLinkWithCreate?: boolean,
): ShareLinkInfoType | undefined {
	if (!requestedSharingLinkKind) {
		return;
	}
	let shareLinkInfo: ShareLinkInfoType | undefined;
	if (enableSingleRequestForShareLinkWithCreate) {
		const { sharing } = response;
		if (!sharing) {
			return;
		}
		shareLinkInfo = {
			createLink: {
				type: requestedSharingLinkKind,
				link: sharing.sharingLink
					? {
							scope: sharing.sharingLink.scope,
							role: sharing.sharingLink.type,
							webUrl: sharing.sharingLink.webUrl,
							...sharing.sharingLink,
					  }
					: undefined,
				error: sharing.error,
				shareId: sharing.shareId,
			},
		};
	} else if (enableShareLinkWithCreate) {
		const { sharing, sharingLink, sharingLinkErrorReason } = response;
		if (!sharingLink && !sharingLinkErrorReason) {
			return;
		}
		shareLinkInfo = {
			createLink: {
				type: requestedSharingLinkKind,
				link: sharingLink,
				error: sharingLinkErrorReason,
				shareId: sharing?.shareId,
			},
		};
	}
	return shareLinkInfo;
}

export async function createNewEmptyFluidFile(
	getStorageToken: InstrumentedStorageTokenFetcher,
	newFileInfo: INewFileInfo,
	logger: ITelemetryLoggerExt,
	epochTracker: EpochTracker,
	forceAccessTokenViaAuthorizationHeader: boolean,
): Promise<string> {
	const filePath = newFileInfo.filePath ? encodeURIComponent(`/${newFileInfo.filePath}`) : "";
	// add .tmp extension to empty file (host is expected to rename)
	const encodedFilename = encodeURIComponent(`${newFileInfo.filename}.tmp`);
	const initialUrl = `${getApiRoot(getOrigin(newFileInfo.siteUrl))}/drives/${
		newFileInfo.driveId
	}/items/root:/${filePath}/${encodedFilename}:/content?@name.conflictBehavior=rename&select=id,name,parentReference`;

	return getWithRetryForTokenRefresh(async (options) => {
		const storageToken = await getStorageToken(options, "CreateNewFile");

		return PerformanceEvent.timedExecAsync(
			logger,
			{ eventName: "createNewEmptyFile" },
			async (event) => {
				const { url, headers } = getUrlAndHeadersWithAuth(
					initialUrl,
					storageToken,
					forceAccessTokenViaAuthorizationHeader,
				);
				headers["Content-Type"] = "application/json";

				const fetchResponse = await runWithRetry(
					async () =>
						epochTracker.fetchAndParseAsJSON<ICreateFileResponse>(
							url,
							{
								body: undefined,
								headers,
								method: "PUT",
							},
							"createFile",
						),
					"createFile",
					logger,
				);

				const content = fetchResponse.content;
				if (!content?.id) {
					throw new NonRetryableError(
						// pre-0.58 error message: ODSP CreateFile call returned no item ID
						"ODSP CreateFile call returned no item ID (for empty file)",
						DriverErrorType.incorrectServerResponse,
						{ driverVersion },
					);
				}
				event.end({
					headers: Object.keys(headers).length !== 0 ? true : undefined,
					...fetchResponse.propsToLog,
				});
				return content.id;
			},
			{ end: true, cancel: "error" },
		);
	});
}

export async function createNewFluidFileFromSummary(
	getStorageToken: InstrumentedStorageTokenFetcher,
	newFileInfo: INewFileInfo,
	logger: ITelemetryLoggerExt,
	createNewSummary: ISummaryTree,
	epochTracker: EpochTracker,
	forceAccessTokenViaAuthorizationHeader: boolean,
): Promise<ICreateFileResponse> {
	const filePath = newFileInfo.filePath ? encodeURIComponent(`/${newFileInfo.filePath}`) : "";
	const encodedFilename = encodeURIComponent(newFileInfo.filename);
	const baseUrl =
		`${getApiRoot(getOrigin(newFileInfo.siteUrl))}/drives/${newFileInfo.driveId}/items/root:` +
		`${filePath}/${encodedFilename}`;

	const containerSnapshot = convertSummaryIntoContainerSnapshot(createNewSummary);

	// Build share link parameter based on the createLinkType provided so that the
	// snapshot api can create and return the share link along with creation of file in the response.
	const createShareLinkParam = buildOdspShareLinkReqParams(newFileInfo.createLinkType);
	const initialUrl = `${baseUrl}:/opStream/snapshots/snapshot${
		createShareLinkParam ? `?${createShareLinkParam}` : ""
	}`;

	return createNewFluidContainerCore<ICreateFileResponse>({
		containerSnapshot,
		getStorageToken,
		logger,
		initialUrl,
		forceAccessTokenViaAuthorizationHeader,
		epochTracker,
		telemetryName: "CreateNewFile",
		fetchType: "createFile",
		validateResponseCallback: (content) => {
			if (!content?.itemId) {
				throw new NonRetryableError(
					"ODSP CreateFile call returned no item ID",
					DriverErrorType.incorrectServerResponse,
					{ driverVersion },
				);
			}
		},
	});
}
