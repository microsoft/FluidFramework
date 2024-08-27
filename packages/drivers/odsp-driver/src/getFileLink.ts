/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryBaseProperties } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import { NonRetryableError, runWithRetry } from "@fluidframework/driver-utils/internal";
import { hasRedirectionLocation } from "@fluidframework/odsp-doclib-utils/internal";
import {
	IOdspUrlParts,
	OdspErrorTypes,
	OdspResourceTokenFetchOptions,
	TokenFetcher,
} from "@fluidframework/odsp-driver-definitions/internal";
import {
	ITelemetryLoggerExt,
	PerformanceEvent,
	isFluidError,
} from "@fluidframework/telemetry-utils/internal";

import { getHeadersWithAuth } from "./getUrlAndHeadersWithAuth.js";
import {
	fetchHelper,
	getWithRetryForTokenRefresh,
	toInstrumentedOdspStorageTokenFetcher,
} from "./odspUtils.js";
import { pkgVersion as driverVersion } from "./packageVersion.js";
import { runWithRetry as runWithRetryForCoherencyAndServiceReadOnlyErrors } from "./retryUtils.js";

// Store cached responses for the lifetime of web session as file link remains the same for given file item
const fileLinkCache = new Map<string, Promise<string>>();

/**
 * Returns file link for a file with given drive and item ids.
 * Scope needed: files.readwrite.all.
 * This function keeps retrying if it gets a retriable error or wait for some delay if it gets a
 * throttling error. In future, we are thinking of app allowing to pass some cancel token, with which
 * we would be able to stop retrying.
 * @param getToken - used to fetch access tokens needed to execute operation
 * @param odspUrlParts - object describing file storage identity
 * @param logger - used to log results of operation, including any error
 * @returns Promise which resolves to file link url when successful; otherwise, undefined.
 */
export async function getFileLink(
	getToken: TokenFetcher<OdspResourceTokenFetchOptions>,
	odspUrlParts: IOdspUrlParts,
	logger: ITelemetryLoggerExt,
): Promise<string> {
	const cacheKey = `${odspUrlParts.siteUrl}_${odspUrlParts.driveId}_${odspUrlParts.itemId}`;
	const maybeFileLinkCacheEntry = fileLinkCache.get(cacheKey);
	if (maybeFileLinkCacheEntry !== undefined) {
		return maybeFileLinkCacheEntry;
	}

	const fileLinkGenerator = async function (): Promise<string> {
		let fileLinkCore: string;
		try {
			let retryCount = 0;
			fileLinkCore = await runWithRetry(
				async () =>
					runWithRetryForCoherencyAndServiceReadOnlyErrors(
						async () =>
							getFileLinkWithLocationRedirectionHandling(getToken, odspUrlParts, logger),
						"getFileLinkCore",
						logger,
					),
				"getShareLink",
				logger,
				{
					// TODO: use a stronger type
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					onRetry(delayInMs: number, error: any) {
						retryCount++;
						if (retryCount === 5) {
							if (error !== undefined && typeof error === "object") {
								// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
								error.canRetry = false;
								throw error;
							}
							throw error;
						}
					},
				},
			);
		} catch (error) {
			// Delete from the cache to permit retrying later.
			fileLinkCache.delete(cacheKey);
			throw error;
		}

		// We are guaranteed to run the getFileLinkCore at least once with successful result (which must be a string)
		assert(
			fileLinkCore !== undefined,
			0x292 /* "Unexpected undefined result from getFileLinkCore" */,
		);
		return fileLinkCore;
	};
	const fileLink = fileLinkGenerator();
	fileLinkCache.set(cacheKey, fileLink);
	return fileLink;
}

/**
 * Handles location redirection while fulfilling the getFilelink call. We don't want browser to handle
 * the redirection as the browser will retry with same auth token which will not work as we need app
 * to regenerate tokens for the new site domain. So when we will make the network calls below we will set
 * the redirect:manual header to manually handle these redirects.
 * Refer: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/308
 * @param getToken - token fetcher to fetch the token.
 * @param odspUrlParts - parts of odsp resolved url.
 * @param logger - logger to send events.
 * @returns Response from the API call.
 * @legacy
 * @alpha
 */
async function getFileLinkWithLocationRedirectionHandling(
	getToken: TokenFetcher<OdspResourceTokenFetchOptions>,
	odspUrlParts: IOdspUrlParts,
	logger: ITelemetryLoggerExt,
): Promise<string> {
	// We can have chains of location redirection one after the other, so have a for loop
	// so that we can keep handling the same type of error. Set max number of redirection to 5.
	let lastError: unknown;
	for (let count = 1; count <= 5; count++) {
		try {
			return await getFileLinkCore(getToken, odspUrlParts, logger);
		} catch (error: unknown) {
			lastError = error;
			if (
				isFluidError(error) &&
				error.errorType === OdspErrorTypes.fileNotFoundOrAccessDeniedError &&
				hasRedirectionLocation(error) &&
				error.redirectLocation !== undefined
			) {
				const redirectLocation = error.redirectLocation;
				logger.sendTelemetryEvent({
					eventName: "LocationRedirectionErrorForGetOdspFileLink",
					retryCount: count,
				});
				// Generate the new SiteUrl from the redirection location.
				const newSiteDomain = new URL(redirectLocation).origin;
				const newSiteUrl = `${newSiteDomain}${new URL(odspUrlParts.siteUrl).pathname}`;
				odspUrlParts.siteUrl = newSiteUrl;
				continue;
			}
			throw error;
		}
	}
	throw lastError;
}

async function getFileLinkCore(
	getToken: TokenFetcher<OdspResourceTokenFetchOptions>,
	odspUrlParts: IOdspUrlParts,
	logger: ITelemetryLoggerExt,
): Promise<string> {
	const fileItem = await getFileItemLite(getToken, odspUrlParts, logger, true);

	// ODSP link requires extra call to return link that is resistant to file being renamed or moved to different folder
	return PerformanceEvent.timedExecAsync(
		logger,
		{ eventName: "odspFileLink", requestName: "getSharingInformation" },
		async (event) => {
			let attempts = 0;
			let additionalProps;
			const fileLink = await getWithRetryForTokenRefresh(async (options) => {
				attempts++;
				const getAuthHeader = toInstrumentedOdspStorageTokenFetcher(
					logger,
					odspUrlParts,
					getToken,
				);

				// IMPORTANT: In past we were using GetFileByUrl() API to get to the list item that was corresponding
				// to the file. This was intentionally replaced with GetFileById() to solve the following issue:
				// GetFileByUrl() uses webDavUrl to locate list item. This API does not work for Consumer scenarios
				// where webDavUrl is constructed using legacy ODC format for backward compatibility reasons.
				// GetFileByUrl() does not understand that format and thus fails. GetFileById() relies on file item
				// unique guid (sharepointIds.listItemUniqueId) and it works uniformly across Consumer and Commercial.
				const url = `${
					odspUrlParts.siteUrl
				}/_api/web/GetFileById(@a1)/ListItemAllFields/GetSharingInformation?@a1=guid${encodeURIComponent(
					`'${fileItem.sharepointIds.listItemUniqueId}'`,
				)}`;
				const method = "POST";
				const authHeader = await getAuthHeader(
					{ ...options, request: { url, method } },
					"GetFileLinkCore",
				);
				const headers = getHeadersWithAuth(authHeader);
				const requestInit = {
					method,
					headers: {
						"Content-Type": "application/json;odata=verbose",
						"Accept": "application/json;odata=verbose",
						"redirect": "manual",
						...headers,
					},
				};
				const response = await fetchHelper(url, requestInit);
				additionalProps = response.propsToLog;

				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				const sharingInfo = await response.content.json();
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
				const directUrl = sharingInfo?.d?.directUrl;
				if (typeof directUrl !== "string") {
					// This will retry once in getWithRetryForTokenRefresh
					throw new NonRetryableError(
						"Malformed GetSharingInformation response",
						OdspErrorTypes.incorrectServerResponse,
						{ driverVersion },
					);
				}
				return directUrl;
			});
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			event.end({ ...additionalProps, attempts });
			return fileLink;
		},
	);
}

/**
 * Sharepoint Ids Interface
 */
interface IGraphSharepointIds {
	listId: string;
	listItemId: string;
	listItemUniqueId: string;
	siteId: string;
	siteUrl: string;
	webId: string;
}

/**
 * This represents a lite version of file item containing only select file properties
 */
interface FileItemLite {
	webUrl: string;
	webDavUrl: string;
	sharepointIds: IGraphSharepointIds;
}

const isFileItemLite = (maybeFileItemLite: unknown): maybeFileItemLite is FileItemLite =>
	typeof (maybeFileItemLite as Partial<FileItemLite>).webUrl === "string" &&
	typeof (maybeFileItemLite as Partial<FileItemLite>).webDavUrl === "string" &&
	// TODO: stronger check
	typeof (maybeFileItemLite as Partial<FileItemLite>).sharepointIds === "object";

async function getFileItemLite(
	getToken: TokenFetcher<OdspResourceTokenFetchOptions>,
	odspUrlParts: IOdspUrlParts,
	logger: ITelemetryLoggerExt,
	forceAccessTokenViaAuthorizationHeader: boolean,
): Promise<FileItemLite> {
	return PerformanceEvent.timedExecAsync(
		logger,
		{ eventName: "odspFileLink", requestName: "getFileItemLite" },
		async (event) => {
			let attempts = 0;
			let additionalProps: ITelemetryBaseProperties | undefined;
			const fileItem = await getWithRetryForTokenRefresh(async (options) => {
				attempts++;
				const { siteUrl, driveId, itemId } = odspUrlParts;
				const getAuthHeader = toInstrumentedOdspStorageTokenFetcher(
					logger,
					odspUrlParts,
					getToken,
				);
				const url = `${siteUrl}/_api/v2.0/drives/${driveId}/items/${itemId}?select=webUrl,webDavUrl,sharepointIds`;
				const method = "GET";
				const authHeader = await getAuthHeader(
					{ ...options, request: { url, method } },
					"GetFileItemLite",
				);
				assert(
					authHeader !== null,
					0x2bc /* "Instrumented token fetcher with throwOnNullToken =true should never return null" */,
				);

				const headers = getHeadersWithAuth(authHeader);
				headers.redirect = "manual";
				const requestInit = { method, headers };
				const response = await fetchHelper(url, requestInit);
				additionalProps = response.propsToLog;

				const responseJson: unknown = await response.content.json();
				if (!isFileItemLite(responseJson)) {
					// This will retry once in getWithRetryForTokenRefresh
					throw new NonRetryableError(
						"Malformed getFileItemLite response",
						OdspErrorTypes.incorrectServerResponse,
						{ driverVersion },
					);
				}
				return responseJson;
			});
			event.end({ ...additionalProps, attempts });
			return fileItem;
		},
	);
}
