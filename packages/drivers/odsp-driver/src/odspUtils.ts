/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { performanceNow } from "@fluid-internal/client-utils";
import {
	ITelemetryBaseLogger,
	ITelemetryBaseProperties,
} from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import {
	IResolvedUrl,
	ISnapshot,
	IContainerPackageInfo,
} from "@fluidframework/driver-definitions/internal";
import {
	type AuthorizationError,
	NetworkErrorBasic,
	NonRetryableError,
	OnlineStatus,
	RetryableError,
	isOnline,
} from "@fluidframework/driver-utils/internal";
import {
	fetchIncorrectResponse,
	getSPOAndGraphRequestIdsFromResponse,
	throwOdspNetworkError,
} from "@fluidframework/odsp-doclib-utils/internal";
import {
	ICacheEntry,
	IOdspResolvedUrl,
	IOdspUrlParts,
	ISharingLinkKind,
	InstrumentedStorageTokenFetcher,
	InstrumentedTokenFetcher,
	OdspErrorTypes,
	authHeaderFromTokenResponse,
	OdspResourceTokenFetchOptions,
	TokenFetchOptions,
	TokenFetcher,
	isTokenFromCache,
	snapshotKey,
	tokenFromResponse,
	snapshotWithLoadingGroupIdKey,
} from "@fluidframework/odsp-driver-definitions/internal";
import {
	type IConfigProvider,
	type IFluidErrorBase,
	ITelemetryLoggerExt,
	PerformanceEvent,
	TelemetryDataTag,
	createChildLogger,
	wrapError,
} from "@fluidframework/telemetry-utils/internal";

import { storeLocatorInOdspUrl } from "./odspFluidFileLink.js";
// eslint-disable-next-line import/no-deprecated
import { ISnapshotContents } from "./odspPublicUtils.js";
import { pkgVersion as driverVersion } from "./packageVersion.js";

export const getWithRetryForTokenRefreshRepeat = "getWithRetryForTokenRefreshRepeat";

/**
 * @legacy
 * @alpha
 */
export interface IOdspResponse<T> {
	content: T;
	headers: Map<string, string>;
	propsToLog: ITelemetryBaseProperties;
	duration: number;
}

/**
 * This interface captures the portion of TokenFetchOptions required for refreshing tokens
 * It is controlled by logic in getWithRetryForTokenRefresh to specify what is the required refresh behavior
 */
export interface TokenFetchOptionsEx {
	refresh: boolean;
	claims?: string;
	tenantId?: string;
	/**
	 * The previous error we hit in {@link getWithRetryForTokenRefresh}.
	 */
	previousError?: unknown;
}

function headersToMap(headers: Headers): Map<string, string> {
	const newHeaders = new Map<string, string>();
	for (const [key, value] of headers.entries()) {
		newHeaders.set(key, value);
	}
	return newHeaders;
}

/**
 * This API should be used with pretty much all network calls (fetch, webSocket connection) in order
 * to correctly handle expired tokens. It relies on callback fetching token, and be able to refetch
 * token on failure. Only specific cases get retry call with refresh = true, all other / unknown errors
 * simply propagate to caller
 */
export async function getWithRetryForTokenRefresh<T>(
	get: (options: TokenFetchOptionsEx) => Promise<T>,
): Promise<T> {
	return get({ refresh: false }).catch(async (error) => {
		const options: TokenFetchOptionsEx = { refresh: true, previousError: error };
		switch ((error as Partial<IFluidErrorBase>).errorType) {
			// If the error is 401 or 403 refresh the token and try once more.
			case OdspErrorTypes.authorizationError: {
				const authError = error as AuthorizationError;
				return get({ ...options, claims: authError.claims, tenantId: authError.tenantId });
			}

			case OdspErrorTypes.incorrectServerResponse: // some error on the wire, retry once
			case OdspErrorTypes.fetchTokenError: {
				// If the token was null, then retry once.
				return get(options);
			}

			default: {
				// Caller may determine that it wants one retry
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-explicit-any
				if ((error as any)[getWithRetryForTokenRefreshRepeat] === true) {
					return get(options);
				}
				throw error;
			}
		}
	});
}

export async function fetchHelper(
	requestInfo: RequestInfo,
	requestInit: RequestInit | undefined,
): Promise<IOdspResponse<Response>> {
	const start = performanceNow();

	return fetch(requestInfo, requestInit).then(
		async (fetchResponse) => {
			const response = fetchResponse as unknown as Response;
			// Let's assume we can retry.
			if (!response) {
				throw new NonRetryableError(
					// pre-0.58 error message: No response from fetch call
					"No response from ODSP fetch call",
					OdspErrorTypes.incorrectServerResponse,
					{ driverVersion },
				);
			}
			if (!response.ok || response.status < 200 || response.status >= 300) {
				throwOdspNetworkError(
					// pre-0.58 error message prefix: odspFetchError
					`ODSP fetch error [${response.status}]`,
					response.status,
					response,
					await response.text(),
				);
			}

			const headers = headersToMap(response.headers);
			return {
				content: response,
				headers,
				propsToLog: getSPOAndGraphRequestIdsFromResponse(headers),
				duration: performanceNow() - start,
			};
		},
		(error) => {
			const online = isOnline();

			// The error message may not be suitable to log for privacy reasons, so tag it as such
			const taggedErrorMessage = {
				value: `${error}`, // This uses toString for objects, which often results in `${error.name}: ${error.message}`
				tag: TelemetryDataTag.UserData,
			};
			// After redacting URLs we believe the error message is safe to log
			const urlRegex = /((http|https):\/\/(\S*))/i;
			const redactedErrorText = taggedErrorMessage.value.replace(urlRegex, "REDACTED_URL");

			// This error is thrown by fetch() when AbortSignal is provided and it gets cancelled
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			if (error.name === "AbortError") {
				throw new RetryableError("Fetch Timeout (AbortError)", OdspErrorTypes.fetchTimeout, {
					driverVersion,
				});
			}
			// TCP/IP timeout
			if (redactedErrorText.includes("ETIMEDOUT")) {
				throw new RetryableError("Fetch Timeout (ETIMEDOUT)", OdspErrorTypes.fetchTimeout, {
					driverVersion,
				});
			}

			// eslint-disable-next-line unicorn/prefer-ternary
			if (online === OnlineStatus.Offline) {
				throw new RetryableError(
					// pre-0.58 error message prefix: Offline
					`ODSP fetch failure (Offline): ${redactedErrorText}`,
					OdspErrorTypes.offlineError,
					{
						driverVersion,
						rawErrorMessage: taggedErrorMessage,
					},
				);
			} else {
				// It is perhaps still possible that this is due to being offline, the error does not reveal enough
				// information to conclude.  Could also be DNS errors, malformed fetch request, CSP violation, etc.
				throw new RetryableError(
					// pre-0.58 error message prefix: Fetch error
					`ODSP fetch failure: ${redactedErrorText}`,
					OdspErrorTypes.fetchFailure,
					{
						driverVersion,
						rawErrorMessage: taggedErrorMessage,
					},
				);
			}
		},
	);
}

/**
 * A utility function to fetch and parse as JSON with support for retries
 * @param requestInfo - fetch requestInfo, can be a string
 * @param requestInit - fetch requestInit
 */
export async function fetchArray(
	requestInfo: RequestInfo,
	requestInit: RequestInit | undefined,
): Promise<IOdspResponse<ArrayBuffer>> {
	const { content, headers, propsToLog, duration } = await fetchHelper(
		requestInfo,
		requestInit,
	);
	let arrayBuffer: ArrayBuffer;
	try {
		arrayBuffer = await content.arrayBuffer();
	} catch {
		// Parsing can fail and message could contain full request URI, including
		// tokens, etc. So do not log error object itself.
		throwOdspNetworkError(
			"Error while parsing fetch response",
			fetchIncorrectResponse,
			content, // response
			undefined, // response text
			propsToLog,
		);
	}

	propsToLog.bodySize = arrayBuffer.byteLength;
	return {
		headers,
		content: arrayBuffer,
		propsToLog,
		duration,
	};
}

/**
 * A utility function to fetch and parse as JSON with support for retries
 * @param requestInfo - fetch requestInfo, can be a string
 * @param requestInit - fetch requestInit
 */
export async function fetchAndParseAsJSONHelper<T>(
	requestInfo: RequestInfo,
	requestInit: RequestInit | undefined,
): Promise<IOdspResponse<T>> {
	const { content, headers, propsToLog, duration } = await fetchHelper(
		requestInfo,
		requestInit,
	);
	let text: string | undefined;
	try {
		text = await content.text();
	} catch {
		// JSON.parse() can fail and message would container full request URI, including
		// tokens... It fails for me with "Unexpected end of JSON input" quite often - an attempt to download big file
		// (many ops) almost always ends up with this error - I'd guess 1% of op request end up here... It always
		// succeeds on retry.
		// So do not log error object itself.
		throwOdspNetworkError(
			// pre-0.58 error message: errorWhileParsingFetchResponse
			"Error while parsing fetch response",
			fetchIncorrectResponse,
			content, // response
			text,
			propsToLog,
		);
	}

	propsToLog.bodySize = text.length;
	const res = {
		headers,
		content: JSON.parse(text) as T,
		propsToLog,
		duration,
	};
	return res;
}

export interface IFileInfoBase {
	type: "New" | "Existing";
	siteUrl: string;
	driveId: string;
}

export interface INewFileInfo extends IFileInfoBase {
	type: "New";
	filename: string;
	filePath: string;
	/**
	 * application can request creation of a share link along with the creation of a new file
	 * by passing in an optional param to specify the kind of sharing link
	 */
	createLinkType?: ISharingLinkKind;
}

export interface IExistingFileInfo extends IFileInfoBase {
	type: "Existing";
	itemId: string;
}

export function isNewFileInfo(
	fileInfo: INewFileInfo | IExistingFileInfo,
): fileInfo is INewFileInfo {
	return fileInfo.type === undefined || fileInfo.type === "New";
}

export function getOdspResolvedUrl(resolvedUrl: IResolvedUrl): IOdspResolvedUrl {
	assert(
		(resolvedUrl as IOdspResolvedUrl).odspResolvedUrl === true,
		0x1de /* "Not an ODSP resolved url" */,
	);
	return resolvedUrl as IOdspResolvedUrl;
}

/**
 * Type narrowing utility to determine if the provided {@link @fluidframework/driver-definitions#IResolvedUrl}
 * is an {@link @fluidframework/odsp-driver-definitions#IOdspResolvedUrl}.
 * @legacy
 * @alpha
 */
export function isOdspResolvedUrl(resolvedUrl: IResolvedUrl): resolvedUrl is IOdspResolvedUrl {
	return "odspResolvedUrl" in resolvedUrl && resolvedUrl.odspResolvedUrl === true;
}

export const createOdspLogger = (logger?: ITelemetryBaseLogger): ITelemetryLoggerExt =>
	createChildLogger({
		logger,
		namespace: "OdspDriver",
		properties: {
			all: {
				driverVersion,
			},
		},
	});

/**
 * Returns a function that can be used to fetch storage token.
 * Storage token can not be empty - if original delegate (tokenFetcher argument) returns null result, exception will be thrown
 */
export function toInstrumentedOdspStorageTokenFetcher(
	logger: ITelemetryLoggerExt,
	resolvedUrlParts: IOdspUrlParts,
	tokenFetcher: TokenFetcher<OdspResourceTokenFetchOptions>,
): InstrumentedStorageTokenFetcher {
	const res = toInstrumentedOdspTokenFetcher(
		logger,
		resolvedUrlParts,
		tokenFetcher,
		true, // throwOnNullToken
		false, // returnPlainToken
	);
	// Drop undefined from signature - we can do it safely due to throwOnNullToken == true above
	return res as InstrumentedStorageTokenFetcher;
}

/**
 * Returns a function that can be used to fetch storage or websocket token.
 * There are scenarios where websocket token is not required / present (consumer stack and ordering service token),
 * thus it could return null. Use toInstrumentedOdspStorageTokenFetcher if you deal with storage token.
 * @param returnPlainToken - When true, tokenResponse.token is returned. When false, tokenResponse.authorizationHeader is returned or an authorization header value is created based on tokenResponse.token
 */
export function toInstrumentedOdspTokenFetcher(
	logger: ITelemetryLoggerExt,
	resolvedUrlParts: IOdspUrlParts,
	tokenFetcher: TokenFetcher<OdspResourceTokenFetchOptions>,
	throwOnNullToken: boolean,
	returnPlainToken: boolean,
): InstrumentedTokenFetcher {
	return async (
		options: TokenFetchOptions,
		name: string,
		alwaysRecordTokenFetchTelemetry: boolean = false,
	) => {
		// Telemetry note: if options.refresh is true, there is a potential perf issue:
		// Host should optimize and provide non-expired tokens on all critical paths.
		// Exceptions: race conditions around expiration, revoked tokens, host that does not care
		// (fluid-fetcher)
		return PerformanceEvent.timedExecAsync(
			logger,
			{
				eventName: `${name}_GetToken`,
				attempts: options.refresh ? 2 : 1,
				hasClaims: !!options.claims,
				hasTenantId: !!options.tenantId,
			},
			async (event) =>
				tokenFetcher({
					...options,
					...resolvedUrlParts,
				}).then(
					(tokenResponse) => {
						const returnVal = returnPlainToken
							? tokenFromResponse(tokenResponse)
							: authHeaderFromTokenResponse(tokenResponse);
						// This event alone generates so many events that is materially impacts cost of telemetry
						// Thus do not report end event when it comes back quickly.
						// Note that most of the hosts do not report if result is comming from cache or not,
						// so we can't rely on that here. But always record if specified explicitly for cases such as
						// calling trees/latest during load.
						if (alwaysRecordTokenFetchTelemetry || event.duration >= 32) {
							event.end({
								fromCache: isTokenFromCache(tokenResponse),
								isNull: returnVal === null,
							});
						}
						if (returnVal === null && throwOnNullToken) {
							throw new NonRetryableError(
								// pre-0.58 error message: Token is null for ${name} call
								`The Host-provided token fetcher returned null`,
								OdspErrorTypes.fetchTokenError,
								{ method: name, driverVersion },
							);
						}
						return returnVal;
					},
					(error) => {
						// There is an important but unofficial contract here where token providers can set canRetry: true
						// to hook into the driver's retry logic (e.g. the retry loop when initiating a connection)
						// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
						const rawCanRetry = error?.canRetry;
						const tokenError = wrapError(
							error,
							(errorMessage) =>
								new NetworkErrorBasic(
									`The Host-provided token fetcher threw an error`,
									OdspErrorTypes.fetchTokenError,
									typeof rawCanRetry === "boolean" ? rawCanRetry : false /* canRetry */,
									{ method: name, errorMessage, driverVersion },
								),
						);
						throw tokenError;
					},
				),
			{ cancel: "generic" },
		);
	};
}

export function createCacheSnapshotKey(
	odspResolvedUrl: IOdspResolvedUrl,
	snapshotWithLoadingGroupId: boolean | undefined,
): ICacheEntry {
	const cacheEntry: ICacheEntry = {
		type: snapshotWithLoadingGroupId ? snapshotWithLoadingGroupIdKey : snapshotKey,
		key: odspResolvedUrl.fileVersion ?? "",
		file: {
			resolvedUrl: odspResolvedUrl,
			docId: odspResolvedUrl.hashedDocumentId,
		},
	};
	return cacheEntry;
}

export function snapshotWithLoadingGroupIdSupported(
	config: IConfigProvider,
): boolean | undefined {
	return config.getBoolean("Fluid.Container.UseLoadingGroupIdForSnapshotFetch2");
}

// 80KB is the max body size that we can put in ump post body for server to be able to accept it.
// Keeping it 78KB to be a little cautious. As per the telemetry 99p is less than 78KB.
export const maxUmpPostBodySize = 79872;

/**
 * Build request parameters to request for the creation of a sharing link along with the creation of the file
 * through the /snapshot api call.
 * @param shareLinkType - Kind of sharing link requested
 * @returns A string of request parameters that can be concatenated with the base URI
 */
export function buildOdspShareLinkReqParams(
	shareLinkType: ISharingLinkKind | undefined,
): string | undefined {
	if (!shareLinkType) {
		return;
	}
	const scope = shareLinkType.scope;
	let shareLinkRequestParams = `createLinkScope=${scope}`;
	const role = shareLinkType.role;
	shareLinkRequestParams = role
		? `${shareLinkRequestParams}&createLinkRole=${role}`
		: shareLinkRequestParams;
	return shareLinkRequestParams;
}

export function measure<T>(callback: () => T): [T, number] {
	const start = performanceNow();
	const result = callback();
	const time = performanceNow() - start;
	return [result, time];
}

export async function measureP<T>(callback: () => Promise<T>): Promise<[T, number]> {
	const start = performanceNow();
	const result = await callback();
	const time = performanceNow() - start;
	return [result, time];
}

export function getJoinSessionCacheKey(odspResolvedUrl: IOdspResolvedUrl): string {
	return `${odspResolvedUrl.hashedDocumentId}/joinsession`;
}

/**
 * Utility API to check if the type of snapshot contents is `ISnapshot`.
 * @internal
 * @param obj - obj whose type needs to be identified.
 */
export function isInstanceOfISnapshot(
	// eslint-disable-next-line import/no-deprecated
	obj: ISnapshotContents | ISnapshot | undefined,
): obj is ISnapshot {
	return obj !== undefined && "snapshotFormatV" in obj && obj.snapshotFormatV === 1;
}

/**
 * This tells whether request if for a specific loading group or not. The snapshot which
 * we fetch on initial load, fetches all ungrouped content.
 */
export function isSnapshotFetchForLoadingGroup(
	loadingGroupIds: string[] | undefined,
): boolean {
	return loadingGroupIds !== undefined && loadingGroupIds.length > 0;
}

/*
 * This tells whether we are using legacy flow for fetching snapshot where we don't use
 * groupId query param in the trees latest network call.
 */
export function useLegacyFlowWithoutGroupsForSnapshotFetch(
	loadingGroupIds: string[] | undefined,
): boolean {
	return loadingGroupIds === undefined;
}

// back-compat: GitHub #9653
const isFluidPackage = (pkg: Record<string, unknown>): boolean =>
	typeof pkg === "object" && typeof pkg?.name === "string" && typeof pkg?.fluid === "object";

/**
 * Appends the store locator properties to the provided base URL. This function is useful for scenarios where an application
 * has a base URL (for example a sharing link) of the Fluid file, but does not have the locator information that would be used by Fluid
 * to load the file later.
 * @param baseUrl - The input URL on which the locator params will be appended.
 * @param resolvedUrl - odsp-driver's resolvedURL object.
 * @param dataStorePath - The relative data store path URL.
 * For requesting a driver URL, this value should always be '/'. If an empty string is passed, then dataStorePath
 * will be extracted from the resolved url if present.
 * @param containerPackageName - Name of the package to be included in the URL.
 * @returns The provided base URL appended with odsp-specific locator information
 */
export function appendNavParam(
	baseUrl: string,
	odspResolvedUrl: IOdspResolvedUrl,
	dataStorePath: string,
	containerPackageName?: string,
): string {
	const url = new URL(baseUrl);

	// If the user has passed an empty dataStorePath, then extract it from the resolved url.
	const actualDataStorePath = dataStorePath || (odspResolvedUrl.dataStorePath ?? "");

	storeLocatorInOdspUrl(url, {
		siteUrl: odspResolvedUrl.siteUrl,
		driveId: odspResolvedUrl.driveId,
		itemId: odspResolvedUrl.itemId,
		dataStorePath: actualDataStorePath,
		appName: odspResolvedUrl.appName,
		containerPackageName,
		fileVersion: odspResolvedUrl.fileVersion,
		context: odspResolvedUrl.context,
	});

	return url.href;
}

/**
 * Returns the package name of the container package information.
 * @param packageInfoSource - Information of the package connected to the URL
 * @returns The package name of the container package
 */
export function getContainerPackageName(
	packageInfoSource: IContainerPackageInfo | undefined,
): string | undefined {
	let containerPackageName: string | undefined;
	if (packageInfoSource && "name" in packageInfoSource) {
		containerPackageName = packageInfoSource.name;
		// packageInfoSource is cast to any as it is typed to IContainerPackageInfo instead of IFluidCodeDetails
		// TODO: use a stronger type
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
	} else if (isFluidPackage((packageInfoSource as any)?.package)) {
		// TODO: use a stronger type
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		containerPackageName = (packageInfoSource as any)?.package.name;
	} else {
		// TODO: use a stronger type
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		containerPackageName = (packageInfoSource as any)?.package;
	}
	return containerPackageName;
}
