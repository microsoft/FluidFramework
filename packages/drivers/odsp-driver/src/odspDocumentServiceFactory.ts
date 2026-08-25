/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IDocumentServiceFactory,
	IPersistedCache,
} from "@fluidframework/driver-definitions/internal";
import type {
	HostStoragePolicy,
	OdspResourceTokenFetchOptions,
	TokenFetcher,
} from "@fluidframework/odsp-driver-definitions/internal";

// eslint-disable-next-line import-x/no-internal-modules
import { LocalOdspDocumentServiceFactory } from "./localOdspDriver/localOdspDocumentServiceFactory.js";
import {
	type IPointInTimeDocumentServiceFactory,
	type OdspPointInTimeDocumentServiceImplementation,
	OdspDocumentServiceFactoryCore,
} from "./odspDocumentServiceFactoryCore.js";
import { LocalPersistentCache } from "./odspCache.js";

/**
 * Options for creating an ODSP document service factory.
 *
 * @legacy @beta
 */
export interface IOdspDocumentServiceFactoryOptions {
	/** Fetches storage access tokens. */
	readonly getStorageToken: TokenFetcher<OdspResourceTokenFetchOptions>;
	/** Fetches websocket access tokens, or `undefined` when unavailable. */
	readonly getWebsocketToken: TokenFetcher<OdspResourceTokenFetchOptions> | undefined;
	/** Persisted ODSP cache. When omitted, a local in-memory cache is used. */
	readonly persistedCache?: IPersistedCache | undefined;
	/** Host storage policy. When omitted, the default driver policies are used. */
	readonly hostPolicy?: HostStoragePolicy | undefined;
	/**
	 * Enables point-in-time loading. Consumers that omit this implementation do not include the
	 * feature code in their dependency graph.
	 */
	readonly pointInTimeDocumentServiceImplementation?:
		| OdspPointInTimeDocumentServiceImplementation
		| undefined;
}

/**
 * Factory for creating the sharepoint document service. Use this if you want to
 * use the sharepoint implementation.
 * @legacy
 * @beta
 */
export class OdspDocumentServiceFactory extends OdspDocumentServiceFactoryCore {
	constructor(
		getStorageToken: TokenFetcher<OdspResourceTokenFetchOptions>,
		getWebsocketToken: TokenFetcher<OdspResourceTokenFetchOptions> | undefined,
		persistedCache?: IPersistedCache,
		hostPolicy?: HostStoragePolicy,
	) {
		super(getStorageToken, getWebsocketToken, persistedCache, hostPolicy);
	}
}

/**
 * Creates an ODSP document service factory with optional consumer-provided features.
 *
 * @param options - Tokens, cache, host policy, and optional feature implementations.
 * @returns The configured ODSP document service factory.
 *
 * @legacy @beta
 */
export function createOdspDocumentServiceFactory(
	options: IOdspDocumentServiceFactoryOptions,
): OdspDocumentServiceFactory {
	const persistedCache = options.persistedCache ?? new LocalPersistentCache();
	const pointInTimeImplementation = options.pointInTimeDocumentServiceImplementation;

	class ConfiguredOdspDocumentServiceFactory extends OdspDocumentServiceFactory {
		public override readonly createPointInTimeDocumentService:
			| IPointInTimeDocumentServiceFactory["createPointInTimeDocumentService"]
			| undefined =
			pointInTimeImplementation === undefined
				? undefined
				: async (resolvedUrl, targetSequenceNumber, logger, clientIsSummarizer) =>
						pointInTimeImplementation({
							resolvedUrl,
							targetSequenceNumber,
							logger,
							clientIsSummarizer,
							persistedCache,
							getStorageToken: options.getStorageToken,
							createDocumentService: async (url, odspLogger, cacheAndTracker, isSummarizer) =>
								this.createDocumentServiceCore(url, odspLogger, cacheAndTracker, isSummarizer),
						});
	}

	return new ConfiguredOdspDocumentServiceFactory(
		options.getStorageToken,
		options.getWebsocketToken,
		persistedCache,
		options.hostPolicy,
	);
}
/**
 * Creates a factory instance for creating a sharepoint document service from a provided snapshot.
 *
 * @remarks Use if you don't want to connect to any kind of external/internal storages and want to provide
 * content directly.
 *
 * @legacy
 * @beta
 */
export function createLocalOdspDocumentServiceFactory(
	localSnapshot: Uint8Array | string,
): IDocumentServiceFactory {
	return new LocalOdspDocumentServiceFactory(localSnapshot);
}
