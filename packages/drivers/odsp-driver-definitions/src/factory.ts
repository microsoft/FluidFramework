/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @legacy
 * @beta
 */
export interface ISnapshotOptions {
	blobs?: number;
	deltas?: number;
	channels?: number;

	/**
	 * Maximum Data size (in bytes)
	 *
	 * @remarks
	 * If specified, SPO will fail snapshot request with 413 error (see {@link @fluidframework/odsp-driver-definitions#(OdspErrorTypes:variable).snapshotTooBig})
	 * if snapshot is bigger in size than specified limit.
	 */
	mds?: number;

	/*
	 * Maximum time limit to fetch snapshot (in seconds)
	 * If specified, client will timeout the fetch request if it exceeds the time limit and
	 * will try to fetch the snapshot without blobs.
	 */
	timeout?: number;
}

/**
 * @legacy
 * @beta
 */
export interface IOpsCachingPolicy {
	/**
	 * Batch size. Controls how many ops are grouped together as single cache entry
	 * The bigger the number, the more efficient it is (less reads & writes)
	 * At the same time, big number means we wait for so many ops to accumulate, which
	 * increases chances and number of trailing ops that would not be flushed to cache
	 * when user closes tab
	 * Use any number below 1 to disable caching
	 * Default: 100
	 */
	batchSize?: number;

	/**
	 * To reduce the problem of losing trailing ops when using big batch sizes, host
	 * could specify how often driver should flush ops it has not flushed yet.
	 * -1 means do not use timer.
	 * Measured in ms.
	 * Default: 5000
	 */
	timerGranularity?: number;

	/**
	 * Total number of ops to cache. When we reach that number, ops caching stops
	 * Default: 5000
	 */
	totalOpsToCache?: number;
}

/**
 * @legacy
 * @beta
 */
export interface ICollabSessionOptions {
	/**
	 * Value indicating the display name for session that admits unauthenticated user.
	 * This name will be used in attribution associated with edits made by such user.
	 * @deprecated starting in 2.0-RC3. No longer needed.
	 */
	unauthenticatedUserDisplayName?: string;
	/**
	 * Value indicating session preference to always pass access token via Authorization header.
	 * Default behavior is to pass access token via query parameter unless overall href string
	 * length exceeds 2048 characters. Using query param is performance optimization which results
	 * in ODSP XHR request being treated as 'simple' request which do not require OPTIONS call to
	 * validate CORS. However, not all ODSP implementations understand this optimization.
	 * For instance, auth layer on Converged stack will fail request with access token passed via
	 * query param.
	 * @deprecated Due to security reasons we will be passing the token via Authorization header only.
	 */
	forceAccessTokenViaAuthorizationHeader?: boolean;
	/**
	 * Value indicating the client display name for current session.
	 * This name will be used in attribution associated with edits made during session.
	 * This is optional and used only when collab session is being joined by client acting in app-only mode (i.e. without user context).
	 * If not specified client display name is extracted from the access token that is used to join session.
	 */
	displayName?: string;
}

/**
 * @legacy
 * @beta
 */
export interface HostStoragePolicy {
	snapshotOptions?: ISnapshotOptions;

	/**
	 * Immutable host-owned attribution metadata applied to every outbound ODSP HTTP request.
	 *
	 * Driver-owned request headers take precedence on case-insensitive name collisions. This
	 * prevents hosts from overriding authentication, content type, epoch, correlation, and
	 * protocol headers. The driver copies these values when it constructs the factory.
	 *
	 * Custom WebSocket headers, including `User-Agent`, depend on Node.js transport support and
	 * might not be sent by browsers.
	 */
	hostProvidedRequestHeaders?: Readonly<Record<string, string>>;

	/**
	 * If set to true, tells driver to concurrently fetch snapshot from storage (SPO) and cache
	 * Container loads from whatever comes first in such case.
	 * Snapshot fetched from storage is pushed to cache in either case.
	 * If set to false, driver will first consult with cache. Only on cache miss (cache does not
	 * return snapshot), driver will fetch snapshot from storage (and push it to cache), otherwise
	 * it will load from cache and not reach out to storage.
	 * Passing true results in faster loads and keeping cache more current, but it increases bandwidth consumption.
	 */
	concurrentSnapshotFetch?: boolean;

	// Options overwriting default ops fetching from storage.
	opsBatchSize?: number;
	concurrentOpsBatches?: number;

	/**
	 * Policy controlling ops caching (leveraging IPersistedCache passed to driver factory)
	 */
	opsCaching?: IOpsCachingPolicy;

	/**
	 * Policy controlling how collaboration session is established
	 */
	sessionOptions?: ICollabSessionOptions;

	/**
	 * @deprecated This field will be always set to true after removal.
	 * True to have the sharing link redeem fallback in case the Trees Latest/Redeem 1RT call fails with redeem error.
	 * During fallback it will first redeem the sharing link and then make the Trees latest call.
	 */
	enableRedeemFallback?: boolean;

	/**
	 * Policy controlling if we will cache initial summary when we create a document
	 */
	cacheCreateNewSummary?: boolean;

	/**
	 * @deprecated This will be replaced with feature gate snapshotFormatFetchType.
	 * Policy controlling if we want to fetch binary format snapshot.
	 */
	fetchBinarySnapshotFormat?: boolean;

	/**
	 * If set to true, socket cache are per OdspDocumentService instead of shared across all instances
	 */
	isolateSocketCache?: boolean;

	/**
	 * @deprecated Switch to using the new feature gated by enableSingleRequestForShareLinkWithCreate
	 * with 'createLinkScope' and 'createLinkRole' is requested to the odsp apis instead of 'createLinkType'.
	 * It enables the creation of sharing link along with the creation of file by setting this value to true.
	 * If the host provides a 'createLinkType' parameter in the request URL to the container.attach()
	 * method, we will send the request to ODSP with the same (if the flag is enabled) so
	 * that a share link can be created with the creation of file to save number for round trips made to ODSP.
	 * (This flag works independently of enableSingleRequestForShareLinkWithCreate which is used for sharing link
	 * requests where 'createLinkScope' is requested.)
	 */
	enableShareLinkWithCreate?: boolean;

	/**
	 * Enable creation of sharing link along with the creation of file by setting this value to true.
	 * If the host provides a 'createLinkScope' parameter in the request URL to the container.attach()
	 * method, we will send the request to ODSP with the same (if the flag is enabled) so
	 * that a share link can be created with the creation of file to save number for round trips made to ODSP.
	 * (This flag works independently of enableShareLinkWithCreate which was used for old sharing link requests
	 * where 'createLinkType' was requested.)
	 */
	enableSingleRequestForShareLinkWithCreate?: boolean;

	/**
	 * True if host does not want the storage service to use the prefetch cache to get the snapshot. Undefined will be treated
	 * as false. This is if the host wants to do some A/B testing.
	 */
	avoidPrefetchSnapshotCache?: boolean;

	/**
	 * Controls how the driver handles a claims challenge from the service.
	 *
	 * @remarks
	 * A claims challenge is a 401 or 403 response with a `WWW-Authenticate` header that contains `error="insufficient_claims"` and a `claims` value.
	 * For more information, see {@link https://learn.microsoft.com/entra/identity-platform/claims-challenge | Claims challenges}.
	 *
	 * By default, the driver gets a new token one time and retries the request.
	 * The driver gives the decoded claims to the token fetcher in {@link TokenFetchOptions.claims}.
	 *
	 * Set this policy to `true` when the host cannot satisfy the challenge itself.
	 * For example, a service that makes requests for another client must send the challenge to that client.
	 * When this policy is `true`, the driver does not retry the request.
	 * The operation fails with the original {@link @fluidframework/driver-definitions#IAuthorizationError}, which has `claims` and `wwwAuthenticate` set.
	 * The driver does not give the claims to the token fetcher in this case.
	 * So when you load the document again after the challenge is satisfied, make sure that the token fetcher returns the new token, even when {@link TokenFetchOptions.refresh} is `false`.
	 * Other authorization errors keep the default behavior.
	 *
	 * As for other authorization errors, the driver clears its cached snapshot of the document when a snapshot request fails with the challenge.
	 * But a load can still succeed, because the driver can use a cached snapshot without waiting for the service.
	 * A later request, such as connecting to the delta stream or fetching ops, then gets the challenge, and the container closes with the error.
	 * So check for a claims challenge in the error of the container's `closed` event as well as in load errors.
	 *
	 * To identify a claims challenge, look for an `errorType` of `authorizationError` with a non-empty `claims` value.
	 * Do not use `wwwAuthenticate` for this, because the driver sets it on all authorization errors from responses that have the header.
	 *
	 * This policy applies to the document services that the factory creates.
	 * It also applies to `prefetchLatestSnapshot` when the factory is given to it.
	 * It does not apply to `OdspDriverUrlResolverForShareLink`.
	 *
	 * @defaultValue `false`
	 */
	propagateClaimsChallenges?: boolean;
}
