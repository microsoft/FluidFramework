/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IResolvedUrl } from "@fluidframework/driver-definitions";
import { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions";
import { getOdspResolvedUrl } from "./odspUtils.js";

/**
 * It takes a resolved url with old siteUrl and creates a new resolved url with updated site url domain.
 * @param resolvedUrl - Previous odsp resolved url with older site url.
 * @param redirectLocation - Url at which the network call has to be made. It contains new site info.
 * @returns The resolved url after patching the correct siteUrl.
 */
export function patchOdspResolvedUrl(
	resolvedUrl: IResolvedUrl,
	redirectLocation: string,
): IOdspResolvedUrl {
	const odspResolvedUrl = { ...getOdspResolvedUrl(resolvedUrl) };
	// Generate the new SiteUrl from the redirection location.
	const newSiteDomain = new URL(redirectLocation).origin;
	const newSiteUrl = `${newSiteDomain}${new URL(odspResolvedUrl.siteUrl).pathname}`;
	odspResolvedUrl.siteUrl = newSiteUrl;
	return odspResolvedUrl;
}
