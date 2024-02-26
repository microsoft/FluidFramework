/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentServiceFactory } from "@fluidframework/driver-definitions";
import {
	OdspResourceTokenFetchOptions,
	TokenFetcher,
	IPersistedCache,
	HostStoragePolicy,
} from "@fluidframework/odsp-driver-definitions";
import { OdspDocumentServiceFactoryCore } from "./odspDocumentServiceFactoryCore.js";
// eslint-disable-next-line import/no-internal-modules
import { LocalOdspDocumentServiceFactory } from "./localOdspDriver/localOdspDocumentServiceFactory.js";

/**
 * Factory for creating the sharepoint document service. Use this if you want to
 * use the sharepoint implementation.
 * @alpha
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
 * Creates a factory instance for creating a sharepoint document service from a provided snapshot.
 *
 * @remarks Use if you don't want to connect to any kind of external/internal storages and want to provide
 * content directly.
 *
 * @alpha
 */
export function createLocalOdspDocumentServiceFactory(
	localSnapshot: Uint8Array | string,
): IDocumentServiceFactory {
	return new LocalOdspDocumentServiceFactory(localSnapshot);
}
