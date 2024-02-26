/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromBase64ToUtf8, fromUtf8ToBase64 } from "@fluid-internal/client-utils";
import { OdspFluidDataStoreLocator } from "./contractsPublic.js";
import { OdcFileSiteOrigin, OdcApiSiteOrigin } from "./constants.js";

const fluidSignature = "1";
const fluidSignatureParamName = "fluid";
const sitePathParamName = "s";
const driveIdParamName = "d";
const itemIdParamName = "f";
const dataStorePathParamName = "c";
const appNameParamName = "a";
const containerPackageNameParamName = "p";
const fileVersionParamName = "v";
const additionalContextParamName = "x";

/**
 * Transforms given Fluid data store locator into string that can be embedded into url
 * @param locator - describes Fluid data store locator info to be encoded
 * @returns string representing encoded Fluid data store locator info
 * @alpha
 */
export function encodeOdspFluidDataStoreLocator(locator: OdspFluidDataStoreLocator): string {
	const siteUrl = new URL(locator.siteUrl);
	const sitePath = encodeURIComponent(siteUrl.pathname);
	const driveId = encodeURIComponent(locator.driveId);
	const itemId = encodeURIComponent(locator.itemId);
	const dataStorePath = encodeURIComponent(locator.dataStorePath);

	let locatorSerialized = `${sitePathParamName}=${sitePath}&${driveIdParamName}=${driveId}&${itemIdParamName}=${itemId}&${dataStorePathParamName}=${dataStorePath}&${fluidSignatureParamName}=${fluidSignature}`;
	if (locator.appName) {
		locatorSerialized += `&${appNameParamName}=${encodeURIComponent(locator.appName)}`;
	}
	if (locator.containerPackageName) {
		locatorSerialized += `&${containerPackageNameParamName}=${encodeURIComponent(
			locator.containerPackageName,
		)}`;
	}
	if (locator.fileVersion) {
		locatorSerialized += `&${fileVersionParamName}=${encodeURIComponent(locator.fileVersion)}`;
	}
	if (locator.context) {
		locatorSerialized += `&${additionalContextParamName}=${encodeURIComponent(
			locator.context,
		)}`;
	}

	return fromUtf8ToBase64(locatorSerialized);
}

/**
 * Decodes given encoded value representing Fluid data store locator extracted from ODSP Fluid file link
 * @param encodedLocatorValue - encoded Fluid data store locator value which was produced by
 * {@link encodeOdspFluidDataStoreLocator} function
 * @param siteOriginUrl - site origin that will be appended to encoded relative path to form absolute file url
 * @param requireFluidSignature - flag representing if the Fluid signature is expected in the url, default true
 * @returns object representing Fluid data store location in ODSP terms
 */
function decodeOdspFluidDataStoreLocator(
	encodedLocatorValue: string,
	siteOriginUrl: string,
	requireFluidSignature: boolean = true,
): OdspFluidDataStoreLocator | undefined {
	const locatorInfo = new URLSearchParams(fromBase64ToUtf8(encodedLocatorValue));

	const signatureValue = locatorInfo.get(fluidSignatureParamName);
	if (requireFluidSignature && signatureValue !== "1") {
		return undefined;
	}

	const sitePath = locatorInfo.get(sitePathParamName);
	const driveId = locatorInfo.get(driveIdParamName);
	const itemId = locatorInfo.get(itemIdParamName);
	const dataStorePath = locatorInfo.get(dataStorePathParamName);
	const appName = locatorInfo.get(appNameParamName) ?? undefined;
	const containerPackageName = locatorInfo.get(containerPackageNameParamName) ?? undefined;
	const fileVersion = locatorInfo.get(fileVersionParamName) ?? undefined;
	const context = locatorInfo.get(additionalContextParamName) ?? undefined;
	// "" is a valid value for dataStorePath so simply check for absence of the param;
	// file storage locator params must be present and non-empty
	if (!sitePath || !driveId || !itemId || dataStorePath === null) {
		return undefined;
	}

	let siteUrl: URL | undefined;
	try {
		siteUrl = new URL(sitePath, siteOriginUrl);
	} catch {
		// Ignore failure to parse url as input might be malformed
	}

	if (!siteUrl) {
		return undefined;
	}

	return {
		siteUrl: siteUrl.href,
		driveId,
		itemId,
		dataStorePath,
		appName,
		containerPackageName,
		fileVersion,
		context,
	};
}

/**
 * This parameter is provided by host in the resolve request and it contains information about the file
 * like driveId, itemId, siteUrl, datastorePath, packageName etc.
 * @alpha
 */
export const locatorQueryParamName = "nav";

/**
 * Embeds Fluid data store locator data into given ODSP url
 * @param url - file url in ODSP format (can be either canonical or share link)
 * @param locator - object representing Fluid data store location in ODSP terms
 * @alpha
 */
export function storeLocatorInOdspUrl(url: URL, locator: OdspFluidDataStoreLocator): void {
	const encodedLocatorValue = encodeOdspFluidDataStoreLocator(locator);
	// IMPORTANT: Do not apply encodeURIComponent to encodedLocatorValue, param value is automatically encoded
	// when set via URLSearchParams class
	url.searchParams.set(locatorQueryParamName, encodedLocatorValue);
}

/**
 * Extract ODSP Fluid data store locator object from given ODSP url. This extracts things like
 * driveId, ItemId, siteUrl etc from a url where these are encoded in nav query param.
 * @param url - ODSP url representing Fluid file link
 * @param requireFluidSignature - flag representing if the Fluid signature is expected in the url, default true
 * @returns object representing Fluid data store location in ODSP terms
 * @alpha
 */
export function getLocatorFromOdspUrl(
	url: URL,
	requireFluidSignature: boolean = true,
): OdspFluidDataStoreLocator | undefined {
	// NOTE: No need to apply decodeURIComponent when accessing query params via URLSearchParams class.
	const encodedLocatorValue = url.searchParams.get(locatorQueryParamName);
	if (!encodedLocatorValue) {
		return undefined;
	}

	// IMPORTANT: ODC deviates from ODSP in that its file link origin is different from vroom api origin.
	// The following code passes vroom api origin as site origin instead of file origin.
	const siteOriginUrl =
		url.origin.toLowerCase() === OdcFileSiteOrigin ? OdcApiSiteOrigin : url.origin;

	return decodeOdspFluidDataStoreLocator(
		encodedLocatorValue,
		siteOriginUrl,
		requireFluidSignature,
	);
}
