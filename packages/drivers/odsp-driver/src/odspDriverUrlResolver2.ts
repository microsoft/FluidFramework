/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidCodeDetails, IRequest, isFluidPackage } from "@fluidframework/core-interfaces";
import { IResolvedUrl, IUrlResolver } from "@fluidframework/driver-definitions";
import { ITelemetryBaseLogger, ITelemetryLogger } from "@fluidframework/common-definitions";
import { ChildLogger, PerformanceEvent } from "@fluidframework/telemetry-utils";
import { getLocatorFromOdspUrl, storeLocatorInOdspUrl, encodeOdspFluidDataStoreLocator } from "./odspFluidFileLink";
import { resolveDataStore } from "./resolveDataStore";
import { IOdspResolvedUrl, OdspDocumentInfo, OdspFluidDataStoreLocator, SharingLinkHeader } from "./contracts";
import { createOdspCreateContainerRequest } from "./createOdspCreateContainerRequest";
import { createOdspUrl } from "./createOdspUrl";
import { OdspDriverUrlResolver } from "./odspDriverUrlResolver";
import { getShareLink } from "./graph";
import {
    IdentityType,
    isTokenFromCache,
    SharingLinkTokenFetcher,
    TokenFetchOptions,
    tokenFromResponse,
} from "./tokenFetch";

export class OdspDriverUrlResolver2 implements IUrlResolver {
    private readonly logger: ITelemetryLogger;
    private readonly getSharingLinkToken:
        (options: TokenFetchOptions, isForFileDefaultUrl: boolean, siteUrl: string) => Promise<string | null>;
    public constructor(
        tokenFetcher: SharingLinkTokenFetcher,
        private readonly identityType: IdentityType = "Enterprise",
        logger?: ITelemetryBaseLogger,
        private readonly appName?: string,
    ) {
        this.logger = ChildLogger.create(logger, "OdspDriver");
        this.getSharingLinkToken = this.toInstrumentedSharingLinkTokenFetcher(this.logger, tokenFetcher);
    }

    public createCreateNewRequest(
        siteUrl: string,
        driveId: string,
        filePath: string,
        fileName: string,
    ) {
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

        const parsingUrl = new URL(fluidInfo.dataStorePath, `${requestUrl.protocol}//${requestUrl.hostname}`);
        // Determine if the caller is passing a query parameter or path since processing will be different.
        if (pathToAppend.startsWith("/?") || pathToAppend.startsWith("?")) {
            const queryParams = new URLSearchParams(pathToAppend);
            queryParams.forEach((value: string, key: string) => {
                parsingUrl.searchParams.append(key, value);
            });
            fluidInfo.dataStorePath = `${parsingUrl.pathname}${parsingUrl.search}`;
        } else {
            fluidInfo.dataStorePath = `${parsingUrl.pathname}${
                parsingUrl.pathname.endsWith("/") || pathToAppend.startsWith("/") ? "" : "/"
            }${pathToAppend}/${parsingUrl.search}`;
        }
        storeLocatorInOdspUrl(requestUrl, fluidInfo);

        return requestUrl.href;
    }

    /**
     * Resolves request URL into driver details
     */
    public async resolve(request: IRequest): Promise<IOdspResolvedUrl> {
        const requestToBeResolved = { headers: request.headers, url: request.url };
        let sharingLinkP: Promise<string> | undefined;
        const isSharingLink = requestToBeResolved.headers?.[SharingLinkHeader.isSharingLink];
        try {
            const url = new URL(request.url);
            // Check if the url is the sharing link.
            if (isSharingLink) {
                sharingLinkP = Promise.resolve(request.url.split("?")[0]);
            }
            const odspFluidInfo = getLocatorFromOdspUrl(url);
            if (odspFluidInfo) {
                requestToBeResolved.url = createOdspUrl(
                    odspFluidInfo.siteUrl,
                    odspFluidInfo.driveId,
                    odspFluidInfo.fileId,
                    odspFluidInfo.dataStorePath,
                    odspFluidInfo.containerPackageName,
                );
            }
        } catch {
            // If the locator throws some error, then try to resolve the request as it is.
        }

        const odspResolvedUrl = await new OdspDriverUrlResolver().resolve(requestToBeResolved);

        // Generate sharingLink only if main url is not sharing link.
        if (!isSharingLink) {
            try {
                sharingLinkP = this.getShareLinkPromise(odspResolvedUrl);
            } catch (error) {}
        }
        if (sharingLinkP) {
            odspResolvedUrl.sharingLinkP = sharingLinkP;
        }
        return odspResolvedUrl;
    }

    private toInstrumentedSharingLinkTokenFetcher(
        logger: ITelemetryLogger,
        tokenFetcher: SharingLinkTokenFetcher,
    ): (options: TokenFetchOptions, isForFileDefaultUrl: boolean, siteUrl: string) => Promise<string | null> {
        return async (options: TokenFetchOptions, isForFileDefaultUrl: boolean, siteUrl: string) => {
            return PerformanceEvent.timedExecAsync(
                logger,
                { eventName: "GetSharingLinkToken" },
                async (event) =>
                    tokenFetcher(siteUrl, isForFileDefaultUrl, options.refresh, options.claims)
                .then((tokenResponse) => {
                    event.end({ fromCache: isTokenFromCache(tokenResponse) });
                    return tokenFromResponse(tokenResponse);
                }));
        };
    }

    private async getShareLinkPromise(resolvedUrl: IOdspResolvedUrl): Promise<string> {
        if (!(resolvedUrl.siteUrl && resolvedUrl.driveId && resolvedUrl.itemId)) {
            throw new Error("Failed to get share link because necessary information is missing " +
                "(e.g. siteUrl, driveId or itemId)");
        }
        if (resolvedUrl.sharingLinkP !== undefined) {
            return resolvedUrl.sharingLinkP;
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
    public async getAbsoluteUrl(
        resolvedUrl: IResolvedUrl,
        relativeUrl: string,
        codeDetails?: IFluidCodeDetails,
    ): Promise<string> {
        const odspResolvedUrl = resolvedUrl as IOdspResolvedUrl;

        const shareLink = await this.getShareLinkPromise(odspResolvedUrl);

        const shareLinkUrl = new URL(shareLink);

        const packageName = isFluidPackage(codeDetails?.package) ? codeDetails?.package.name : codeDetails?.package ??
        odspResolvedUrl.codeHint?.containerPackageName;

        storeLocatorInOdspUrl(shareLinkUrl, {
            siteUrl: odspResolvedUrl.siteUrl,
            driveId: odspResolvedUrl.driveId,
            fileId: odspResolvedUrl.itemId,
            dataStorePath: relativeUrl,
            appName: this.appName,
            containerPackageName: packageName,
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
