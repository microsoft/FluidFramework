/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { ISummaryTree } from "@fluidframework/driver-definitions";
import { ISnapshot } from "@fluidframework/driver-definitions/internal";
import { NonRetryableError } from "@fluidframework/driver-utils/internal";
import {
	IFileEntry,
	IOdspResolvedUrl,
	InstrumentedStorageTokenFetcher,
	OdspErrorTypes,
	ShareLinkInfoType,
} from "@fluidframework/odsp-driver-definitions/internal";
import {
	ITelemetryLoggerExt,
	PerformanceEvent,
} from "@fluidframework/telemetry-utils/internal";

import { ICreateFileResponse } from "./contracts.js";
import { ClpCompliantAppHeader } from "./contractsPublic.js";
import {
	convertCreateNewSummaryTreeToTreeAndBlobs,
	convertSummaryIntoContainerSnapshot,
	createNewFluidContainerCore,
} from "./createNewUtils.js";
import { createOdspUrl } from "./createOdspUrl.js";
import { EpochTracker } from "./epochTracker.js";
import { getHeadersWithAuth } from "./getUrlAndHeadersWithAuth.js";
import { OdspDriverUrlResolver } from "./odspDriverUrlResolver.js";
import { getApiRoot } from "./odspUrlHelper.js";
import {
	INewFileInfo,
	buildOdspShareLinkReqParams,
	createCacheSnapshotKey,
	getWithRetryForTokenRefresh,
} from "./odspUtils.js";
import { pkgVersion as driverVersion } from "./packageVersion.js";
import { runWithRetry } from "./retryUtils.js";

const isInvalidFileName = (fileName: string): boolean => {
	const invalidCharsRegex = /["*/:<>?\\|]+/g;
	return invalidCharsRegex.test(fileName);
};

/**
 * Creates a new Fluid file.
 * Returns resolved url
 */
export async function createNewFluidFile(
	getAuthHeader: InstrumentedStorageTokenFetcher,
	newFileInfo: INewFileInfo,
	logger: ITelemetryLoggerExt,
	createNewSummary: ISummaryTree | undefined,
	epochTracker: EpochTracker,
	fileEntry: IFileEntry,
	createNewCaching: boolean,
	forceAccessTokenViaAuthorizationHeader: boolean,
	isClpCompliantApp?: boolean,
	enableSingleRequestForShareLinkWithCreate?: boolean,
): Promise<IOdspResolvedUrl> {
	// Check for valid filename before the request to create file is actually made.
	if (isInvalidFileName(newFileInfo.filename)) {
		throw new NonRetryableError(
			// pre-0.58 error message: Invalid filename
			"Invalid filename for createNew",
			OdspErrorTypes.invalidFileNameError,
			{ driverVersion },
		);
	}

	let itemId: string;
	let summaryHandle: string = "";
	let shareLinkInfo: ShareLinkInfoType | undefined;
	if (createNewSummary === undefined) {
		itemId = await createNewEmptyFluidFile(getAuthHeader, newFileInfo, logger, epochTracker);
	} else {
		const content = await createNewFluidFileFromSummary(
			getAuthHeader,
			newFileInfo,
			logger,
			createNewSummary,
			epochTracker,
			forceAccessTokenViaAuthorizationHeader,
		);
		itemId = content.itemId;
		summaryHandle = content.id;

		shareLinkInfo = extractShareLinkData(content, enableSingleRequestForShareLinkWithCreate);
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
		const snapshot: ISnapshot = convertCreateNewSummaryTreeToTreeAndBlobs(
			createNewSummary,
			summaryHandle,
		);
		// caching the converted summary
		await epochTracker.put(createCacheSnapshotKey(odspResolvedUrl), snapshot);
	}
	return odspResolvedUrl;
}

/**
 * If user requested creation of a sharing link along with the creation of the file by providing
 * createLinkScope in the request parameters then extract and save the sharing link information from
 * the response if it is available.
 * In case there was an error in creation of the sharing link, error is provided back in the response,
 * and does not impact the creation of file in ODSP.
 * @param requestedSharingLinkKind - Kind of sharing link requested to be created along with the creation of file.
 * @param response - Response object received from the /snapshot api call
 * @returns Sharing link information received in the response from a successful creation of a file.
 */
function extractShareLinkData(
	response: ICreateFileResponse,
	enableSingleRequestForShareLinkWithCreate?: boolean,
): ShareLinkInfoType | undefined {
	let shareLinkInfo: ShareLinkInfoType | undefined;
	if (enableSingleRequestForShareLinkWithCreate) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const { sharing } = response;
		if (!sharing) {
			return;
		}
		/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
		shareLinkInfo = {
			createLink: {
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
		/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
	}
	return shareLinkInfo;
}

export async function createNewEmptyFluidFile(
	getAuthHeader: InstrumentedStorageTokenFetcher,
	newFileInfo: INewFileInfo,
	logger: ITelemetryLoggerExt,
	epochTracker: EpochTracker,
): Promise<string> {
	const filePath = newFileInfo.filePath ? encodeURIComponent(`/${newFileInfo.filePath}`) : "";
	// add .tmp extension to empty file (host is expected to rename)
	const encodedFilename = encodeURIComponent(`${newFileInfo.filename}.tmp`);
	const initialUrl = `${getApiRoot(new URL(newFileInfo.siteUrl))}/drives/${
		newFileInfo.driveId
	}/items/root:/${filePath}/${encodedFilename}:/content?@name.conflictBehavior=rename&select=id,name,parentReference`;

	return getWithRetryForTokenRefresh(async (options) => {
		const url = initialUrl;
		const method = "PUT";
		const authHeader = await getAuthHeader(
			{ ...options, request: { url, method } },
			"CreateNewFile",
		);

		return PerformanceEvent.timedExecAsync(
			logger,
			{ eventName: "createNewEmptyFile" },
			async (event) => {
				const headers = getHeadersWithAuth(authHeader);
				headers["Content-Type"] = "application/json";

				const fetchResponse = await runWithRetry(
					async () =>
						epochTracker.fetchAndParseAsJSON<ICreateFileResponse>(
							url,
							{
								body: undefined,
								headers,
								method,
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
						OdspErrorTypes.incorrectServerResponse,
						{ driverVersion },
					);
				}
				event.end({
					...fetchResponse.propsToLog,
				});
				return content.id;
			},
			{ end: true, cancel: "error" },
		);
	});
}

export async function createNewFluidFileFromSummary(
	getAuthHeader: InstrumentedStorageTokenFetcher,
	newFileInfo: INewFileInfo,
	logger: ITelemetryLoggerExt,
	createNewSummary: ISummaryTree,
	epochTracker: EpochTracker,
	forceAccessTokenViaAuthorizationHeader: boolean,
): Promise<ICreateFileResponse> {
	const filePath = newFileInfo.filePath ? encodeURIComponent(`/${newFileInfo.filePath}`) : "";
	const encodedFilename = encodeURIComponent(newFileInfo.filename);
	const baseUrl =
		`${getApiRoot(new URL(newFileInfo.siteUrl))}/drives/${newFileInfo.driveId}/items/root:` +
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
		getAuthHeader,
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
					OdspErrorTypes.incorrectServerResponse,
					{ driverVersion },
				);
			}
		},
	});
}
