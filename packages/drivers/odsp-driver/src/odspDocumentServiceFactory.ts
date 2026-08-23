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
	type IOdspDocumentServiceFactoryOptions,
	type IPointInTimeDocumentServiceFactory,
	type OdspPointInTimeDocumentServiceImplementation,
	OdspDocumentServiceFactoryCore,
} from "./odspDocumentServiceFactoryCore.js";

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
		options?: IOdspDocumentServiceFactoryOptions,
	) {
		super(getStorageToken, getWebsocketToken, persistedCache, hostPolicy, options);
	}
}

function isPointInTimeDocumentServiceFactory(
	factory: OdspDocumentServiceFactory,
): factory is OdspDocumentServiceFactory & IPointInTimeDocumentServiceFactory {
	return typeof factory.createPointInTimeDocumentService === "function";
}

/**
 * Creates an ODSP document service factory that supports point-in-time loading.
 *
 * @param getStorageToken - Fetches storage access tokens.
 * @param getWebsocketToken - Fetches websocket access tokens, or `undefined` when unavailable.
 * @param pointInTimeDocumentServiceImplementation - Consumer-imported point-in-time implementation.
 * @param persistedCache - Persisted ODSP cache. When omitted, a local in-memory cache is used.
 * @param hostPolicy - Host storage policy. When omitted, the default driver policies are used.
 * @returns An ODSP document service factory with point-in-time loading capability.
 *
 * @legacy @beta
 */
export function getOdspPointInTimeDocumentServiceFactory(
	getStorageToken: TokenFetcher<OdspResourceTokenFetchOptions>,
	getWebsocketToken: TokenFetcher<OdspResourceTokenFetchOptions> | undefined,
	pointInTimeDocumentServiceImplementation: OdspPointInTimeDocumentServiceImplementation,
	persistedCache?: IPersistedCache,
	hostPolicy?: HostStoragePolicy,
): IPointInTimeDocumentServiceFactory {
	const factory = new OdspDocumentServiceFactory(
		getStorageToken,
		getWebsocketToken,
		persistedCache,
		hostPolicy,
		{ pointInTimeDocumentServiceImplementation },
	);
	if (!isPointInTimeDocumentServiceFactory(factory)) {
		throw new Error(
			"The ODSP document service factory does not support point-in-time loading.",
		);
	}
	return factory;
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
