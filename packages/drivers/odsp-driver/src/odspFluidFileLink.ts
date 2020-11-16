/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromBase64ToUtf8, fromUtf8ToBase64 } from "@fluidframework/common-utils";
import { OdspFluidDataStoreLocator } from "./contracts";
import { OdcFileSiteOrigin, OdcApiSiteOrigin } from "./constants";

const fluidSignature = "1";
const fluidSignatureParamName = "fluid";
const fluidSitePathParamName = "s";
const fluidDriveIdParamName = "d";
const fluidFileIdParamName = "f";
const fluidDataStorePathParamName = "c";
const fluidAppNameParamName = "a";
const fluidContainerPackageNameParamName = "p";

/**
 * Transforms given Fluid data store locator into string that can be embedded into url
 * @param locator - describes Fluid data store locator info to be encoded
 * @returns string representing encoded Fluid data store locator info
 */
export function encodeOdspFluidDataStoreLocator(locator: OdspFluidDataStoreLocator): string {
    const siteUrl = new URL(locator.siteUrl);
    const sitePath = encodeURIComponent(siteUrl.pathname);
    const driveId = encodeURIComponent(locator.driveId);
    const fileId = encodeURIComponent(locator.fileId);
    const dataStorePath = encodeURIComponent(locator.dataStorePath);

    let locatorSerialized = `${fluidSitePathParamName}=${sitePath}&${fluidDriveIdParamName}=${driveId}&${
        fluidFileIdParamName}=${fileId}&${fluidDataStorePathParamName}=${dataStorePath}&${
        fluidSignatureParamName}=${fluidSignature}`;
    if (locator.appName) {
        locatorSerialized += `&${fluidAppNameParamName}=${encodeURIComponent(locator.appName)}`;
    }
    if (locator.containerPackageName) {
        locatorSerialized += `&${fluidContainerPackageNameParamName}=${
            encodeURIComponent(locator.containerPackageName)}`;
    }

    return fromUtf8ToBase64(locatorSerialized);
}

/**
 * Decodes given encoded value representing Fluid data store locator extracted from ODSP Fluid file link
 * @param encodedLocatorValue - encoded Fluid data store locator value which was produced by
 *  encodeOdspFluidDataStoreLocator method
 * @param siteOriginUrl - site origin that will be appended to encoded relative path to form absolute file url
 * @returns object representing Fluid data store location in ODSP terms
 */
function decodeOdspFluidDataStoreLocator(
    encodedLocatorValue: string,
    siteOriginUrl: string,
): OdspFluidDataStoreLocator | undefined {
    const locatorInfo = new URLSearchParams(fromBase64ToUtf8(encodedLocatorValue));

    const signatureValue = locatorInfo.get(fluidSignatureParamName);
    if (signatureValue !== "1") {
        return undefined;
    }

    const sitePath = locatorInfo.get(fluidSitePathParamName);
    const driveId = locatorInfo.get(fluidDriveIdParamName);
    const fileId = locatorInfo.get(fluidFileIdParamName);
    const dataStorePath = locatorInfo.get(fluidDataStorePathParamName);
    const appName = locatorInfo.get(fluidAppNameParamName) ?? undefined;
    const containerPackageName = locatorInfo.get(fluidContainerPackageNameParamName) ?? undefined;
    // "" is a valid value for dataStorePath so simply check for absence of the param;
    // the rest of params must be present and non-empty
    if (!sitePath || !driveId || !fileId || dataStorePath === null) {
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
        fileId,
        dataStorePath,
        appName,
        containerPackageName,
    };
}

const locatorQueryParamName = "nav";

/**
 * Embeds Fluid data store locator data into given ODSP url
 * @param url - file url in ODSP format (can be either canonical or share link)
 * @param locator - object representing Fluid data store location in ODSP terms
 */
export function storeLocatorInOdspUrl(url: URL, locator: OdspFluidDataStoreLocator) {
    const encodedLocatorValue = encodeOdspFluidDataStoreLocator(locator);
    // IMPORTANT: Do not apply encodeURIComponent to encodedLocatorValue, param value is automatically encoded
    // when set via URLSearchParams class
    url.searchParams.set(locatorQueryParamName, encodedLocatorValue);
}

/**
 * Extract ODSP Fluid data store locator object from given ODSP url
 * @param url - ODSP url representing Fluid file link
 * @returns object representing Fluid data store location in ODSP terms
 */
export function getLocatorFromOdspUrl(url: URL): OdspFluidDataStoreLocator | undefined {
    // NOTE: No need to apply decodeURIComponent when accessing query params via URLSearchParams class.
    const encodedLocatorValue = url.searchParams.get(locatorQueryParamName);
    if (!encodedLocatorValue) {
        return undefined;
    }

    // IMPORTANT: ODC deviates from ODSP in that its file link origin is different from vroom api origin.
    // The following code passes vroom api origin as site origin instead of file origin.
    const siteOriginUrl = url.origin.toLowerCase() === OdcFileSiteOrigin ? OdcApiSiteOrigin : url.origin;

    return decodeOdspFluidDataStoreLocator(encodedLocatorValue, siteOriginUrl);
}
