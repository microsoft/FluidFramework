/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IResolvedUrl } from "@fluidframework/driver-definitions";
import { ISession } from "@fluidframework/server-services-client";

/**
 * Assume documentId is at end of url path.
 * This is true for Routerlicious' and Tinylicious' documentUrl and deltaStorageUrl.
 * Routerlicious and Tinylicious do not use documentId in storageUrl nor ordererUrl.
 * TODO: Ideally we would be able to regenerate the resolvedUrl, rather than patching the current one.
 */
export const replaceDocumentIdInPath = (urlPath: string, documentId: string): string =>
	urlPath.split("/").slice(0, -1).concat([documentId]).join("/");

export const getDiscoveredFluidResolvedUrl = (
	resolvedUrl: IResolvedUrl,
	session: ISession,
): IResolvedUrl => {
	const discoveredOrdererUrl = new URL(session.ordererUrl);
	const deltaStorageUrl = new URL(resolvedUrl.endpoints.deltaStorageUrl);
	deltaStorageUrl.host = discoveredOrdererUrl.host;

	const discoveredStorageUrl = new URL(session.historianUrl);
	const storageUrl = new URL(resolvedUrl.endpoints.storageUrl);
	storageUrl.host = discoveredStorageUrl.host;

	const parsedUrl = new URL(resolvedUrl.url);
	const discoveredResolvedUrl: IResolvedUrl = {
		endpoints: {
			deltaStorageUrl: deltaStorageUrl.toString(),
			ordererUrl: session.ordererUrl,
			deltaStreamUrl: session.deltaStreamUrl,
			storageUrl: storageUrl.toString(),
		},
		id: resolvedUrl.id,
		tokens: resolvedUrl.tokens,
		type: resolvedUrl.type,
		url: new URL(`https://${discoveredOrdererUrl.host}${parsedUrl.pathname}`).toString(),
	};
	return discoveredResolvedUrl;
};
