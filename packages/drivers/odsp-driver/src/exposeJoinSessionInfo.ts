/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { IDocumentServiceFactory, IResolvedUrl } from "@fluidframework/driver-definitions";
import { ISocketStorageDiscovery } from "./contractsPublic";
import { getJoinSessionCacheKey, getOdspResolvedUrl } from "./odspUtils";
import { OdspDocumentServiceFactoryCore } from "./odspDocumentServiceFactoryCore";

/**
 * Api which returns the current join session response stored in non persistent cache, if present
 * @param factory - odsp driver factory
 * @param resolvedUrl - resolved url for container
 * @returns - Current join session response stored in cache. Undefined if not present.
 */
export async function getJoinSessionInfo(
	factory: IDocumentServiceFactory,
	resolvedUrl: IResolvedUrl,
): Promise<ISocketStorageDiscovery | undefined> {
	assert(factory instanceof OdspDocumentServiceFactoryCore, "factory type is not recognized");
	const odspResolvedUrl = getOdspResolvedUrl(resolvedUrl);
	const joinSessionResponse = await factory.joinSessionCache.get(
		getJoinSessionCacheKey(odspResolvedUrl),
	);
	return joinSessionResponse?.joinSessionResponse;
}
