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

/**
 * @deprecated This is deprecated in favour of OdspDocumentServiceFactory as the socket io is now loaded inside the
 * other dynamically imported module.
 * @internal
 */
export class OdspDocumentServiceFactoryWithCodeSplit
	extends OdspDocumentServiceFactoryCore
	implements IDocumentServiceFactory
{
	constructor(
		getStorageToken: TokenFetcher<OdspResourceTokenFetchOptions>,
		getWebsocketToken: TokenFetcher<OdspResourceTokenFetchOptions> | undefined,
		persistedCache?: IPersistedCache,
		hostPolicy?: HostStoragePolicy,
	) {
		super(getStorageToken, getWebsocketToken, persistedCache, hostPolicy);
	}
}
