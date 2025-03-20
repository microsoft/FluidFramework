/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, Deferred } from "@fluidframework/core-utils/internal";
import {
	LocationRedirectionError,
	NonRetryableError,
	RateLimiter,
	ThrottlingError,
} from "@fluidframework/driver-utils/internal";
import {
	ICacheEntry,
	IEntry,
	IFileEntry,
	IOdspError,
	IOdspErrorAugmentations,
	IOdspResolvedUrl,
	IPersistedCache,
	OdspErrorTypes,
	maximumCacheDurationMs,
	snapshotKey,
	snapshotWithLoadingGroupIdKey,
} from "@fluidframework/odsp-driver-definitions/internal";
import {
	ITelemetryLoggerExt,
	PerformanceEvent,
	isFluidError,
	loggerToMonitoringContext,
	normalizeError,
	wrapError,
} from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import { IVersionedValueWithEpoch, persistedCacheValueVersion } from "./contracts.js";
import { ClpCompliantAppHeader } from "./contractsPublic.js";
import { INonPersistentCache, IOdspCache, IPersistedFileCache } from "./odspCache.js";
import { patchOdspResolvedUrl } from "./odspLocationRedirection.js";
import {
	IOdspResponse,
	fetchAndParseAsJSONHelper,
	fetchArray,
	fetchHelper,
	getOdspResolvedUrl,
} from "./odspUtils.js";
import { pkgVersion as driverVersion } from "./packageVersion.js";

/**
 * @legacy
 * @alpha
 */
export type FetchType =
	| "blob"
	| "createBlob"
	| "createFile"
	| "joinSession"
	| "ops"
	| "test"
	| "snapshotTree"
	| "treesLatest"
	| "uploadSummary"
	| "push"
	| "versions"
	| "renameFile";

/**
 * @legacy
 * @alpha
 */
export type FetchTypeInternal = FetchType | "cache";

export const Odsp409Error = "Odsp409Error";

/**
 * In ODSP, the concept of "epoch" refers to binary updates to files. For example, this might include using
 * version restore, or if the user downloads a Fluid file and then uploads it again. These result in the epoch
 * value being incremented.
 *
 * The implications of these binary updates is that the Fluid state is disrupted: the sequence number might
 * go backwards, the data might be inconsistent with the latest state of collaboration, etc. As a result, it's
 * not safe to continue collaboration across an epoch change. We need to detect these epoch changes and
 * error out from the collaboration.
 *
 * This class is a wrapper around fetch calls. It adds epoch to the request made so that the
 * server can match it with its epoch value in order to match the version.
 * It also validates the epoch value received in response of fetch calls. If the epoch does not match,
 * then it also clears all the cached entries for the given container.
 * @legacy
 * @alpha
 */
export class EpochTracker implements IPersistedFileCache {
	private _fluidEpoch: string | undefined;

	private readonly snapshotCacheExpiryTimeoutMs: number;
	public readonly rateLimiter: RateLimiter;
	private readonly driverId = uuid();
	// This tracks the request number made by the driver instance.
	private networkCallNumber = 1;
	constructor(
		protected readonly cache: IPersistedCache,
		protected readonly fileEntry: IFileEntry,
		protected readonly logger: ITelemetryLoggerExt,
		protected readonly clientIsSummarizer?: boolean,
	) {
		// Limits the max number of concurrent requests to 24.
		this.rateLimiter = new RateLimiter(24);

		// Matches the TestOverride logic for the policy defined in odspDocumentStorageServiceBase.ts
		this.snapshotCacheExpiryTimeoutMs = loggerToMonitoringContext(logger).config.getBoolean(
			"Fluid.Driver.Odsp.TestOverride.DisableSnapshotCache",
		)
			? 0
			: maximumCacheDurationMs;
	}

	// public for UT purposes only!
	public setEpoch(epoch: string, fromCache: boolean, fetchType: FetchTypeInternal): void {
		assert(this._fluidEpoch === undefined, 0x1db /* "epoch exists" */);
		this._fluidEpoch = epoch;

		this.logger.sendTelemetryEvent({
			eventName: "EpochLearnedFirstTime",
			epoch,
			fetchType,
			fromCache,
		});
	}

	// TODO: return a stronger type
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public async get(entry: IEntry): Promise<any> {
		try {
			// Return undefined so that the ops/snapshots are grabbed from the server instead of the cache
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const value: IVersionedValueWithEpoch = await this.cache.get(
				this.fileEntryFromEntry(entry),
			);
			// Version mismatch between what the runtime expects and what it recieved.
			// The cached value should not be used
			if (value === undefined || value.version !== persistedCacheValueVersion) {
				return undefined;
			}
			assert(value.fluidEpoch !== undefined, 0x1dc /* "all entries have to have epoch" */);
			if (this._fluidEpoch === undefined) {
				this.setEpoch(value.fluidEpoch, true, "cache");
				// Epoch mismatch, the cached value is considerably different from what the current state of
				// the runtime and should not be used
			} else if (this._fluidEpoch !== value.fluidEpoch) {
				return undefined;
			}
			// Expire the cached snapshot if it's older than snapshotCacheExpiryTimeoutMs and immediately
			// expire all old caches that do not have cacheEntryTime
			if (entry.type === snapshotKey || entry.type === snapshotWithLoadingGroupIdKey) {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
				const cacheTime = value.value?.cacheEntryTime;
				const currentTime = Date.now();
				if (
					cacheTime === undefined ||
					currentTime - cacheTime >= this.snapshotCacheExpiryTimeoutMs
				) {
					this.logger.sendTelemetryEvent({
						eventName: "odspVersionsCacheExpired",
						duration: currentTime - cacheTime,
						maxCacheAgeMs: this.snapshotCacheExpiryTimeoutMs,
					});
					await this.removeEntries();
					return undefined;
				}
			}
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return value.value;
		} catch (error) {
			this.logger.sendErrorEvent({ eventName: "cacheFetchError", type: entry.type }, error);
			return undefined;
		}
	}

	// TODO: take a stronger type or `unknown`
	// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
	public async put(entry: IEntry, value: any): Promise<void> {
		assert(this._fluidEpoch !== undefined, 0x1dd /* "no epoch" */);
		// For snapshots, the value should have the cacheEntryTime.
		// This will be used to expire snapshots older than snapshotCacheExpiryTimeoutMs.
		if (entry.type === snapshotKey || entry.type === snapshotWithLoadingGroupIdKey) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
			value.cacheEntryTime = value.cacheEntryTime ?? Date.now();
		}
		const data: IVersionedValueWithEpoch = {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			value,
			version: persistedCacheValueVersion,
			fluidEpoch: this._fluidEpoch,
		};
		return this.cache.put(this.fileEntryFromEntry(entry), data).catch((error) => {
			this.logger.sendErrorEvent({ eventName: "cachePutError", type: entry.type }, error);
			throw error;
		});
	}

	public async removeEntries(): Promise<void> {
		try {
			return await this.cache.removeEntries(this.fileEntry);
		} catch (error) {
			this.logger.sendErrorEvent({ eventName: "removeCacheEntries" }, error);
		}
	}

	public get fluidEpoch(): string | undefined {
		return this._fluidEpoch;
	}

	public async validateEpoch(epoch: string | undefined, fetchType: FetchType): Promise<void> {
		assert(epoch !== undefined, 0x584 /* response should contain epoch */);
		try {
			this.validateEpochFromResponse(epoch, fetchType);
		} catch (error) {
			await this.checkForEpochError(error, epoch, fetchType);
			throw error;
		}
	}

	/**
	 * Api to fetch the response for given request and parse it as json.
	 * @param url - url of the request
	 * @param fetchOptions - fetch options for request containing body, headers etc.
	 * @param fetchType - method for which fetch is called.
	 * @param addInBody - Pass True if caller wants to add epoch in post body.
	 * @param fetchReason - fetch reason to add to the request.
	 */
	public async fetchAndParseAsJSON<T>(
		url: string,
		fetchOptions: RequestInit,
		fetchType: FetchType,
		addInBody: boolean = false,
		fetchReason?: string,
	): Promise<IOdspResponse<T>> {
		return this.fetchCore<T>(
			url,
			fetchOptions,
			fetchAndParseAsJSONHelper,
			fetchType,
			addInBody,
			fetchReason,
		);
	}

	/**
	 * Api to fetch the response for given request and parse it as json.
	 * @param url - url of the request
	 * @param fetchOptions - fetch options for request containing body, headers etc.
	 * @param fetchType - method for which fetch is called.
	 * @param addInBody - Pass True if caller wants to add epoch in post body.
	 * @param fetchReason - fetch reason to add to the request.
	 */
	public async fetch(
		url: string,
		fetchOptions: RequestInit,
		fetchType: FetchType,
		addInBody: boolean = false,
		fetchReason?: string,
	): Promise<IOdspResponse<Response>> {
		return this.fetchCore<Response>(
			url,
			fetchOptions,
			fetchHelper,
			fetchType,
			addInBody,
			fetchReason,
		);
	}

	private async fetchCore<T>(
		url: string,
		fetchOptions: RequestInit,
		fetcher: (url: string, fetchOptions: RequestInit) => Promise<IOdspResponse<T>>,
		fetchType: FetchType,
		addInBody: boolean = false,
		fetchReason?: string,
	): Promise<IOdspResponse<T>> {
		const clientCorrelationId = this.formatClientCorrelationId(fetchReason);
		// Add epoch in fetch request.
		this.addEpochInRequest(fetchOptions, addInBody, clientCorrelationId);
		let epochFromResponse: string | undefined;
		return this.rateLimiter
			.schedule(async () => fetcher(url, fetchOptions))
			.then((response) => {
				epochFromResponse = response.headers.get("x-fluid-epoch");
				this.validateEpochFromResponse(epochFromResponse, fetchType);
				response.propsToLog.XRequestStatsHeader = clientCorrelationId;
				return response;
			})
			.catch(async (error) => {
				// Get the server epoch from error in case we don't have it as if undefined we won't be able
				// to mark it as epoch error.
				if (epochFromResponse === undefined) {
					epochFromResponse = (error as IOdspError).serverEpoch;
				}
				await this.checkForEpochError(error, epochFromResponse, fetchType);
				throw error;
			})
			.catch((error) => {
				// If the error is about location redirection, then we need to generate new resolved url with correct
				// location info.
				if (
					isFluidError(error) &&
					error.errorType === OdspErrorTypes.fileNotFoundOrAccessDeniedError
				) {
					const redirectLocation = (error as IOdspErrorAugmentations).redirectLocation;
					if (redirectLocation !== undefined) {
						const redirectUrl: IOdspResolvedUrl = patchOdspResolvedUrl(
							this.fileEntry.resolvedUrl,
							redirectLocation,
						);
						const locationRedirectionError = new LocationRedirectionError(
							error.message,
							redirectUrl,
							{ driverVersion, redirectLocation },
						);
						locationRedirectionError.addTelemetryProperties(error.getTelemetryProperties());
						throw locationRedirectionError;
					}
				}
				throw error;
			})
			.catch((error) => {
				const fluidError = normalizeError(error, {
					props: { XRequestStatsHeader: clientCorrelationId },
				});
				throw fluidError;
			});
	}

	/**
	 * Api to fetch the response as it is for given request.
	 * @param url - url of the request
	 * @param fetchOptions - fetch options for request containing body, headers etc.
	 * @param fetchType - method for which fetch is called.
	 * @param addInBody - Pass True if caller wants to add epoch in post body.
	 * @param fetchReason - fetch reason to add to the request.
	 */
	public async fetchArray(
		url: string,
		fetchOptions: { [index: string]: RequestInit },
		fetchType: FetchType,
		addInBody: boolean = false,
		fetchReason?: string,
	): Promise<IOdspResponse<ArrayBuffer>> {
		return this.fetchCore<ArrayBuffer>(
			url,
			fetchOptions,
			fetchArray,
			fetchType,
			addInBody,
			fetchReason,
		);
	}

	private addEpochInRequest(
		fetchOptions: RequestInit,
		addInBody: boolean,
		clientCorrelationId: string,
	): void {
		const isClpCompliantApp = getOdspResolvedUrl(this.fileEntry.resolvedUrl).isClpCompliantApp;
		if (addInBody) {
			const headers: { [key: string]: string } = {};
			headers["X-RequestStats"] = clientCorrelationId;
			if (this.fluidEpoch !== undefined) {
				headers["x-fluid-epoch"] = this.fluidEpoch;
			}
			if (isClpCompliantApp) {
				headers[ClpCompliantAppHeader.isClpCompliantApp] = isClpCompliantApp.toString();
			}
			this.addParamInBody(fetchOptions, headers);
		} else {
			const addHeader = (key: string, val: string): void => {
				fetchOptions.headers = {
					...fetchOptions.headers,
				};
				assert(
					fetchOptions.headers !== undefined,
					0x282 /* "Headers should be present now" */,
				);
				fetchOptions.headers[key] = val;
			};
			addHeader("X-RequestStats", clientCorrelationId);
			if (this.fluidEpoch !== undefined) {
				addHeader("x-fluid-epoch", this.fluidEpoch);
			}
			if (isClpCompliantApp) {
				addHeader(ClpCompliantAppHeader.isClpCompliantApp, isClpCompliantApp.toString());
			}
		}
	}

	private addParamInBody(fetchOptions: RequestInit, headers: { [key: string]: string }): void {
		// We use multi part form request for post body where we want to use this.
		// So extract the form boundary to mark the end of form.
		const body = fetchOptions.body;
		assert(typeof body === "string", 0x21d /* "body is not string" */);
		const splitBody = body.split("\r\n");
		const firstLine = splitBody.shift();
		assert(firstLine?.startsWith("--") === true, 0x21e /* "improper boundary format" */);
		const formParams = [firstLine];
		for (const [key, value] of Object.entries(headers)) {
			formParams.push(`${key}: ${value}`);
		}
		for (const value of splitBody) {
			formParams.push(value);
		}
		fetchOptions.body = formParams.join("\r\n");
	}

	private formatClientCorrelationId(fetchReason?: string): string {
		const items: string[] = [
			`driverId=${this.driverId}`,
			`RequestNumber=${this.networkCallNumber++}`,
			`driverVersion=${driverVersion}`,
			`isSummarizer=${this.clientIsSummarizer}`,
		];
		if (fetchReason !== undefined) {
			items.push(`fetchReason=${fetchReason}`);
		}
		return items.join(", ");
	}

	protected validateEpochFromResponse(
		epochFromResponse: string | undefined,
		fetchType: FetchTypeInternal,
		fromCache: boolean = false,
	): void {
		const error = this.checkForEpochErrorCore(epochFromResponse);
		if (error !== undefined) {
			throw error;
		}
		if (epochFromResponse !== undefined && this._fluidEpoch === undefined) {
			this.setEpoch(epochFromResponse, fromCache, fetchType);
		}
	}

	private async checkForEpochError(
		error: unknown,
		epochFromResponse: string | null | undefined,
		fetchType: FetchTypeInternal,
		fromCache: boolean = false,
	): Promise<void> {
		if (isFluidError(error) && error.errorType === OdspErrorTypes.fileOverwrittenInStorage) {
			const epochError = this.checkForEpochErrorCore(epochFromResponse);
			if (epochError !== undefined) {
				epochError.addTelemetryProperties({
					fromCache,
					fetchType,
				});
				this.logger.sendErrorEvent({ eventName: "fileOverwrittenInStorage" }, epochError);
				// If the epoch mismatches, then clear all entries for such file entry from cache.
				await this.removeEntries();
				throw epochError;
			}
			// If it was categorized as epoch error but the epoch returned in response matches with the client epoch
			// then it was coherency 409, so rethrow it as throttling error so that it can retried. Default throttling
			// time is 1s.
			const newError = wrapError(error, (message: string) => {
				return new ThrottlingError(`Coherency 409: ${message}`, 1 /* retryAfterSeconds */, {
					[Odsp409Error]: true,
					driverVersion,
				});
			});
			throw newError;
		}
	}

	private checkForEpochErrorCore(
		epochFromResponse: string | null | undefined,
	): NonRetryableError<"fileOverwrittenInStorage"> | undefined {
		// If epoch is undefined, then don't compare it because initially for createNew or TreesLatest
		// initializes this value. Sometimes response does not contain epoch as it is still in
		// implementation phase at server side. In that case also, don't compare it with our epoch value.
		if (this.fluidEpoch && epochFromResponse && this.fluidEpoch !== epochFromResponse) {
			// This is similar in nature to how fluidEpochMismatchError (409) is handled.
			// Difference - client detected mismatch, instead of server detecting it.
			return new NonRetryableError("Epoch mismatch", OdspErrorTypes.fileOverwrittenInStorage, {
				driverVersion,
				serverEpoch: epochFromResponse,
				clientEpoch: this.fluidEpoch,
			});
		}
	}

	private fileEntryFromEntry(entry: IEntry): ICacheEntry {
		return { ...entry, file: this.fileEntry };
	}
}

export class EpochTrackerWithRedemption extends EpochTracker {
	private readonly treesLatestDeferral = new Deferred<void>();

	constructor(
		protected readonly cache: IPersistedCache,
		protected readonly fileEntry: IFileEntry,
		protected readonly logger: ITelemetryLoggerExt,
		protected readonly clientIsSummarizer?: boolean,
	) {
		super(cache, fileEntry, logger, clientIsSummarizer);
		// Handles the rejected promise within treesLatestDeferral.
		this.treesLatestDeferral.promise.catch(() => {});
	}

	protected validateEpochFromResponse(
		epochFromResponse: string | undefined,
		fetchType: FetchType,
		fromCache: boolean = false,
	): void {
		super.validateEpochFromResponse(epochFromResponse, fetchType, fromCache);

		// Any successful call means we have access to a file, i.e. any redemption that was required already happened.
		// That covers cases of "treesLatest" as well as "getVersions" or "createFile" - all the ways we can start
		// exploring a file.
		this.treesLatestDeferral.resolve();
	}

	// TODO: return a stronger type
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public async get(entry: IEntry): Promise<any> {
		let result = super.get(entry);

		// equivalence of what happens in fetchAndParseAsJSON()
		if (entry.type === snapshotKey || entry.type === snapshotWithLoadingGroupIdKey) {
			result = result
				.then((value) => {
					// If there is nothing in cache, we need to wait for network call to complete (and do redemption)
					// Otherwise file was redeemed in prior session, so if joinSession failed, we should not retry
					if (value !== undefined) {
						this.treesLatestDeferral.resolve();
					}
					// eslint-disable-next-line @typescript-eslint/no-unsafe-return
					return value;
				})
				.catch((error) => {
					this.treesLatestDeferral.reject(error);
					throw error;
				});
		}
		return result;
	}

	public async fetchAndParseAsJSON<T>(
		url: string,
		fetchOptions: { [index: string]: RequestInit },
		fetchType: FetchType,
		addInBody: boolean = false,
		fetchReason?: string,
	): Promise<IOdspResponse<T>> {
		// Optimize the flow if we know that treesLatestDeferral was already completed by the timer we started
		// joinSession call. If we did - there is no reason to repeat the call as it will fail with same error.
		const completed = this.treesLatestDeferral.isCompleted;

		try {
			return await super.fetchAndParseAsJSON<T>(
				url,
				fetchOptions,
				fetchType,
				addInBody,
				fetchReason,
			);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (error: any) {
			// Only handling here treesLatest. If createFile failed, we should never try to do joinSession.
			// Similar, if getVersions failed, we should not do any further storage calls.
			// So treesLatest is the only call that can have parallel joinSession request.
			if (fetchType === "treesLatest") {
				this.treesLatestDeferral.reject(error);
			}
			if (
				fetchType !== "joinSession" ||
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				error.statusCode < 401 ||
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				error.statusCode > 404 ||
				completed
			) {
				throw error;
			}
		}

		// It is joinSession failing with 401..404 error
		// Repeat after waiting for treeLatest succeeding (or fail if it failed).
		// No special handling after first call - if file has been deleted, then it's game over.

		// Ensure we have some safety here - we do not want to deadlock if we got logic somewhere wrong.
		// If we waited too long, we will log error event and proceed with call.
		// It may result in failure for user, but refreshing document would address it.
		// Thus we use rather long timeout (not to get these failures as much as possible), but not large enough
		// to unblock the process.
		await PerformanceEvent.timedExecAsync(
			this.logger,
			{ eventName: "JoinSessionSyncWait" },
			async (event) => {
				const timeoutRes = 51; // anything will work here
				let timer: ReturnType<typeof setTimeout>;
				const timeoutP = new Promise<number>((resolve) => {
					timer = setTimeout(() => {
						resolve(timeoutRes);
					}, 15000);
				});
				const res = await Promise.race([
					timeoutP,
					// cancel timeout to unblock UTs (otherwise Node process does not exit for 15 sec)
					this.treesLatestDeferral.promise.finally(() => clearTimeout(timer)),
				]);
				if (res === timeoutRes) {
					event.cancel();
				}
			},
			{ start: true, end: true, cancel: "generic" },
		);
		return super.fetchAndParseAsJSON<T>(url, fetchOptions, fetchType, addInBody);
	}
}

/**
 * @legacy
 * @alpha
 */
export interface ICacheAndTracker {
	cache: IOdspCache;
	epochTracker: EpochTracker;
}

export function createOdspCacheAndTracker(
	persistedCacheArg: IPersistedCache,
	nonpersistentCache: INonPersistentCache,
	fileEntry: IFileEntry,
	logger: ITelemetryLoggerExt,
	clientIsSummarizer?: boolean,
): ICacheAndTracker {
	const epochTracker = new EpochTrackerWithRedemption(
		persistedCacheArg,
		fileEntry,
		logger,
		clientIsSummarizer,
	);
	return {
		cache: {
			...nonpersistentCache,
			persistedCache: epochTracker,
		},
		epochTracker,
	};
}
