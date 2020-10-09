/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/core-interfaces";
import { IResolvedUrl, IUrlResolver } from "@fluidframework/driver-definitions";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { getLocatorFromOdspUrl, storeLocatorInOdspUrl, encodeOdspFluidDataStoreLocator } from "./odspFluidFileLink";
import { resolveDataStore } from "./resolveDataStore";
import { IOdspResolvedUrl, OdspDocumentInfo, OdspFluidDataStoreLocator, SharingLinkHeader } from "./contracts";
import { createOdspCreateContainerRequest } from "./createOdspCreateContainerRequest";
import { createOdspUrl } from "./createOdspUrl";
import { resolveRequest } from "./odspDriverUrlResolver";
import { getShareLink } from "./graph";
import { IdentityType, TokenFetchOptions } from "./tokenFetch";

export class OdspDriverUrlResolver2 implements IUrlResolver {
    public constructor(
        private readonly getSharingLinkToken:
            (options: TokenFetchOptions, isForFileDefaultUrl: boolean) => Promise<string | null>,
        private readonly identityType: IdentityType = "Enterprise",
        private readonly logger?: ITelemetryLogger,
        private readonly appName?: string,
    ) { }

    public createCreateNewRequest(siteUrl: string, driveId: string, filePath: string, fileName: string) {
        return createOdspCreateContainerRequest(siteUrl, driveId, filePath, fileName);
    }

    /**
     * Takes an already generated data store url (from requestUrl) and appends a path to the
     * existing data store information.
     */
    public appendDataStorePath(requestUrl: URL, pathToAppend: string): string | undefined {
        const fluidInfo = getLocatorFromOdspUrl(requestUrl);

        if (!fluidInfo) {
            return undefined;
        }

        fluidInfo.dataStorePath = `${fluidInfo.dataStorePath}/${pathToAppend}`;
        storeLocatorInOdspUrl(requestUrl, fluidInfo);

        return requestUrl.href;
    }

    /**
     * Resolves request URL into driver details
     */
    public async resolve(request: IRequest): Promise<IOdspResolvedUrl> {
        const requestToBeResolved = { headers: request.headers, url: request.url };
        let sharingLink: string | undefined;
        try {
            const url = new URL(request.url);
            // Check if the url is the sharing link.
            if (request.headers?.[SharingLinkHeader.isSharingLink]) {
                sharingLink = request.url.split("?")[0];
            }
            const odspFluidInfo = getLocatorFromOdspUrl(url);
            if (odspFluidInfo) {
                requestToBeResolved.url = createOdspUrl(
                    odspFluidInfo.siteUrl,
                    odspFluidInfo.driveId,
                    odspFluidInfo.fileId,
                    odspFluidInfo.dataStorePath,
                );
            }
        } catch {
            // If the locator throws some error, then try to resolve the request as it is.
        }

        const odspResolvedUrl = await resolveRequest(requestToBeResolved);

        // Generate sharingLink only if specified in the request.
        if (requestToBeResolved.headers?.[SharingLinkHeader.generateSharingLink]) {
            await this.getShareLinkPromise(odspResolvedUrl)
            .then((shareLink: string) => sharingLink = shareLink)
            .catch(() => {});
        }
        if (sharingLink) {
            odspResolvedUrl.sharingLink = sharingLink;
        }
        return odspResolvedUrl;
    }

    private async getShareLinkPromise(resolvedUrl: IOdspResolvedUrl): Promise<string> {
        if (!(resolvedUrl.siteUrl && resolvedUrl.driveId && resolvedUrl.itemId)) {
            throw new Error("Failed to get share link because necessary information is missing " +
                "(e.g. siteUrl, driveId or itemId)");
        }
        if (resolvedUrl.sharingLink !== undefined) {
            return resolvedUrl.sharingLink;
        }
        const newLinkPromise = getShareLink(
            this.getSharingLinkToken,
            resolvedUrl.siteUrl,
            resolvedUrl.driveId,
            resolvedUrl.itemId,
            this.identityType,
            this.logger,
            "existingAccess",
        ).then((shareLink) => {
                if (!shareLink) {
                    throw new Error("Failed to get share link");
                }
                return shareLink;
        }).catch((error) => {
            if (this.logger) {
                this.logger.sendErrorEvent({ eventName: "FluidFileUrlError" }, error);
            }
            throw error;
        });

        return newLinkPromise;
    }

    /**
     * Requests a driver + data store storage URL
     * @param resolvedUrl - The driver resolved URL
     * @param request - The relative data store path URL. For requesting a driver URL, this value should always be '/'
     */
    public async getAbsoluteUrl(resolvedUrl: IResolvedUrl, relativeUrl: string): Promise<string> {
        const odspResolvedUrl = resolvedUrl as IOdspResolvedUrl;

        const shareLink = await this.getShareLinkPromise(odspResolvedUrl);

        const shareLinkUrl = new URL(shareLink);

        storeLocatorInOdspUrl(shareLinkUrl, {
            siteUrl: odspResolvedUrl.siteUrl,
            driveId: odspResolvedUrl.driveId,
            fileId: odspResolvedUrl.itemId,
            dataStorePath: relativeUrl,
            appName: this.appName,
        });

        return shareLinkUrl.href;
    }

    /**
     * Retrieves data store path information from a storage URL. Returns undefined if the resolver
     * does not handle this URL
     */
    public static resolveDataStore(url: URL): string | undefined {
        return resolveDataStore(url);
    }

    /**
     * Crafts a supported document/driver URL
     */
    public static createDocumentUrl(baseUrl: string, driverInfo: OdspDocumentInfo) {
        const url = new URL(baseUrl);

        storeLocatorInOdspUrl(url, {
            siteUrl: driverInfo.siteUrl,
            driveId: driverInfo.driveId,
            fileId: driverInfo.fileId,
            dataStorePath: driverInfo.dataStorePath,
        });

        return url.href;
    }

    /**
     * Crafts a supported data store nav param
     */
    public static createNavParam(locator: OdspFluidDataStoreLocator) {
        return encodeOdspFluidDataStoreLocator(locator);
    }
}
