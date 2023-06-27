/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IResolvedUrl } from "@fluidframework/driver-definitions";
import { ISocketStorageDiscovery } from "./contractsPublic";
import { getJoinSessionCacheKey, getOdspResolvedUrl } from "./odspUtils";
import { OdspDocumentServiceFactory } from "./odspDocumentServiceFactory";

/**
 * Api which returns the current join session response stored in non persistent cache, if present
 * @param factory - odsp driver factory
 * @param resolvedUrl - resolved url for container
 * @returns - Current join session response stored in cache. Undefined if not present.
 */
export async function getJoinSessionInfo(
	factory: OdspDocumentServiceFactory,
	resolvedUrl: IResolvedUrl,
): Promise<ISocketStorageDiscovery | undefined> {
	const odspResolvedUrl = getOdspResolvedUrl(resolvedUrl);
	const joinSessionResponse = await factory.joinSessionCache?.get(
		getJoinSessionCacheKey(odspResolvedUrl),
	);
	return joinSessionResponse?.joinSessionResponse;
}
