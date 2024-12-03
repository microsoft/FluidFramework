/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IOdspUrlParts } from "@fluidframework/odsp-driver-definitions/internal";

// Centralized store for all ODC/SPO logic

/**
 * Checks whether or not the given URL has an ODC origin
 * @param url - The URL to check
 * @internal
 */
export function hasOdcOrigin(url: URL): boolean {
	return (
		// Primary API endpoint and several test endpoints
		url.origin.endsWith("onedrive.com") ||
		// *storage.live.com hostnames
		url.origin.endsWith("storage.live.com") ||
		// live-int
		url.origin.endsWith("storage.live-int.com") ||
		// Test endpoints
		url.origin.endsWith("onedrive-tst.com")
	);
}

/**
 * Gets the correct API root for the given ODSP url, e.g. 'https://foo-my.sharepoint.com/_api/v2.1'
 * @param url - The URL
 * @internal
 */
export function getApiRoot(url: URL): string {
	let prefix = "_api/";
	if (hasOdcOrigin(url)) {
		prefix = "";
	}

	return `${url.origin}/${prefix}v2.1`;
}

/**
 * Whether or not the given URL is a valid SPO/ODB URL
 * @param url - The URL to check
 * @internal
 */
export function isSpoUrl(url: URL): boolean {
	// Format: foo.sharepoint.com/_api/v2.1./drives/bar/items/baz and foo.sharepoint-df.com/...
	const hostRegex = /\.sharepoint(?:-df)?\.com$/;
	const pathRegex = /^\/_api\/v2\.1\/drives\/[^/]+\/items\/[^/]+/;

	return hostRegex.test(url.host.toLowerCase()) && pathRegex.test(url.pathname.toLowerCase());
}

/**
 * Whether or not the given URL is a valid ODC URL
 * @param url - The URL to check
 * @internal
 */
export function isOdcUrl(url: URL): boolean {
	if (!hasOdcOrigin(url)) {
		return false;
	}

	const path = url.pathname.toLowerCase();

	// Splitting the regexes so we don't have regex soup
	// Format: /v2.1/drive/items/ABC123!123 and /v2.1/drives/ABC123/items/ABC123!123
	const odcRegex = /^\/v2\.1\/(?:drive|drives\/[^/]+)\/items\/[\dA-Za-z]+!\d+/;

	// Format: /v2.1/drives('ABC123')/items('ABC123!123')
	const odcODataRegex = /^\/v2\.1\/drives\('[^/]+'\)\/items\('[\dA-Za-z]+!\d+'\)/;

	return odcRegex.test(path) || odcODataRegex.test(path);
}

/**
 * Breaks an ODSP URL into its parts, extracting the site, drive ID, and item ID.
 * Returns undefined for invalid/malformed URLs.
 * @param url - The (raw) URL to parse
 * @internal
 */
export async function getOdspUrlParts(url: URL): Promise<IOdspUrlParts | undefined> {
	const pathname = url.pathname;

	// Joinsession like URL
	// Pick a regex based on the hostname
	// TODO This will only support ODC using api.onedrive.com, update to handle the future (share links etc)
	let joinSessionMatch: RegExpExecArray | null;
	if (hasOdcOrigin(url)) {
		// Capture groups:
		// 0: match
		// 1: origin
		// 2: optional `drives` capture (the `/drives/<DRIVEID>` API format vs `/drive`)
		// 3: optional captured drive ID
		// 4: Item ID
		// 5: Drive ID portion of Item ID
		joinSessionMatch =
			/(.*)\/v2\.1\/drive(s\/([\dA-Za-z]+))?\/items\/(([\dA-Za-z]+)!\d+)/.exec(pathname);

		if (joinSessionMatch === null) {
			// Try again but with the OData format ( `/drives('ABC123')/items('ABC123!456')` )
			joinSessionMatch =
				/(.*)\/v2\.1\/drives\('([\dA-Za-z]+)'\)\/items\('(([\dA-Za-z]+)!\d+)'\)/.exec(
					pathname,
				);

			if (joinSessionMatch === null) {
				return undefined;
			}
		}

		const driveId = joinSessionMatch[3] || joinSessionMatch[5];
		const itemId = joinSessionMatch[4];

		return { siteUrl: `${url.origin}${url.pathname}`, driveId, itemId };
	} else {
		joinSessionMatch = /(.*)\/_api\/v2\.1\/drives\/([^/]*)\/items\/([^/]*)(.*)/.exec(pathname);

		if (joinSessionMatch === null) {
			return undefined;
		}
		const driveId = joinSessionMatch[2];
		const itemId = joinSessionMatch[3];

		return { siteUrl: `${url.origin}${url.pathname}`, driveId, itemId };
	}
}

/**
 * Inspect the ODSP siteUrl to guess if this document is in SPDF or MSIT, to aid livesite investigations
 * @param urlOnSite - The URL of the site or a resource on the site
 * @returns undefined if the URL doesn't match known SPDF/MSIT patterns, "SPDF" if it's SPDF, "MSIT" if it's MSIT
 */
export function checkForKnownServerFarmType(urlOnSite: string): "SPDF" | "MSIT" | undefined {
	const domain = new URL(urlOnSite).hostname.toLowerCase();
	if (domain.endsWith(".sharepoint-df.com")) {
		return "SPDF";
	} else if (
		domain === "microsoft.sharepoint.com" ||
		domain === "microsoft-my.sharepoint.com"
	) {
		return "MSIT";
	}
	return undefined;
}
