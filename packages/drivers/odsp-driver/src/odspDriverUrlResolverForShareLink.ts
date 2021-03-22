/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PromiseCache } from "@fluidframework/common-utils";
import { IFluidCodeDetails, IRequest, isFluidPackage } from "@fluidframework/core-interfaces";
import { IResolvedUrl, IUrlResolver } from "@fluidframework/driver-definitions";
import { ITelemetryBaseLogger, ITelemetryLogger } from "@fluidframework/common-definitions";
import { fetchTokenErrorCode, throwOdspNetworkError } from "@fluidframework/odsp-doclib-utils";
import { ChildLogger, PerformanceEvent } from "@fluidframework/telemetry-utils";
import { getLocatorFromOdspUrl, storeLocatorInOdspUrl, encodeOdspFluidDataStoreLocator } from "./odspFluidFileLink";
import { IOdspResolvedUrl, OdspDocumentInfo, OdspFluidDataStoreLocator, SharingLinkHeader } from "./contracts";
import { createOdspCreateContainerRequest } from "./createOdspCreateContainerRequest";
import { createOdspUrl } from "./createOdspUrl";
import { OdspDriverUrlResolver } from "./odspDriverUrlResolver";
import {
    IdentityType,
    isTokenFromCache,
    OdspResourceTokenFetchOptions,
    TokenFetcher,
} from "./tokenFetch";
import { getFileLink } from "./getFileLink";

/**
 * Resolver to resolve urls like the ones created by createOdspUrl which is driver inner
 * url format and the ones which have things like driveId, siteId, itemId etc encoded in nav param.
 * This resolver also handles share links and try to generate one for the use by the app.
 */
export class OdspDriverUrlResolverForShareLink implements IUrlResolver {
    private readonly logger: ITelemetryLogger;
    private readonly sharingLinkCache = new PromiseCache<string, string>();
    private readonly instrumentedTokenFetcher: TokenFetcher<OdspResourceTokenFetchOptions> | undefined;
    /**
     * Creates url resolver instance
     * @param tokenFetcher - Function that returns access token used to fetch share link.
     * Can be set as 'undefined' for cases where share link is not needed. Currently, only
     * getAbsoluteUrl() method requires share link.
     * @param identityType - identity type for signed in user. This value determines the shape
     * of share link as it differs for Enterprise and Consumer users
     * @param logger - logger object that is used as telemetry sink
     * @param appName - application name hint that is encoded with url produced by getAbsoluteUrl() method.
     * This hint is used by link handling logic which determines which app to redirect to when user
     * navigates directly to the link.
     */
    public constructor(
        tokenFetcher: TokenFetcher<OdspResourceTokenFetchOptions> | undefined = undefined,
        private readonly identityType: IdentityType = "Enterprise",
        logger?: ITelemetryBaseLogger,
        private readonly appName?: string,
    ) {
        this.logger = ChildLogger.create(logger, "OdspDriver");
        if (tokenFetcher) {
            this.instrumentedTokenFetcher = this.toInstrumentedTokenFetcher(this.logger, tokenFetcher);
        }
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

    private getKey(resolvedUrl: IOdspResolvedUrl): string {
        return `${resolvedUrl.siteUrl},${resolvedUrl.driveId},${resolvedUrl.itemId}`;
    }

    /**
     * Resolves request URL into driver details
     */
    public async resolve(request: IRequest): Promise<IOdspResolvedUrl> {
        const requestToBeResolved = { headers: request.headers, url: request.url };
        const isSharingLinkToRedeem = requestToBeResolved.headers?.[SharingLinkHeader.isSharingLinkToRedeem];
        try {
            const url = new URL(request.url);

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

        if (isSharingLinkToRedeem) {
            odspResolvedUrl.sharingLinkToRedeem = request.url.split("?")[0];
        }
        if (odspResolvedUrl.itemId) {
            // Kick start the sharing link request if we don't have it already as a performance optimization.
            // For detached create new, we don't have an item id yet and therefore cannot generate a share link
            this.getShareLinkPromise(odspResolvedUrl).catch(() => {});
        }
        return odspResolvedUrl;
    }

    private toInstrumentedTokenFetcher(
        logger: ITelemetryLogger,
        tokenFetcher: TokenFetcher<OdspResourceTokenFetchOptions>,
    ): TokenFetcher<OdspResourceTokenFetchOptions> {
        return async (options: OdspResourceTokenFetchOptions) => {
            return PerformanceEvent.timedExecAsync(
                logger,
                { eventName: "GetSharingLinkToken" },
                async (event) => tokenFetcher(options).then((tokenResponse) => {
                    if (tokenResponse === null) {
                        throwOdspNetworkError("Share link Token is null", fetchTokenErrorCode);
                    }
                    event.end({ fromCache: isTokenFromCache(tokenResponse) });
                    return tokenResponse;
                }));
        };
    }

    private async getShareLinkPromise(resolvedUrl: IOdspResolvedUrl): Promise<string> {
        if (this.instrumentedTokenFetcher === undefined) {
            throw new Error("Failed to get share link because token fetcher is missing");
        }

        if (!(resolvedUrl.siteUrl && resolvedUrl.driveId && resolvedUrl.itemId)) {
            throw new Error("Failed to get share link because necessary information is missing " +
                "(e.g. siteUrl, driveId or itemId)");
        }

        const key = this.getKey(resolvedUrl);
        const cachedLinkPromise = this.sharingLinkCache.get(key);
        if (cachedLinkPromise) {
            return cachedLinkPromise;
        }
        const newLinkPromise = getFileLink(
            this.instrumentedTokenFetcher,
            resolvedUrl.siteUrl,
            resolvedUrl.driveId,
            resolvedUrl.itemId,
            this.identityType,
            this.logger,
        ).then((fileLink) => {
            if (!fileLink) {
                throw new Error("Failed to get share link");
            }
            return fileLink;
        }).catch((error) => {
            this.logger.sendErrorEvent({ eventName: "FluidFileUrlError" }, error);
            this.sharingLinkCache.remove(key);
            throw error;
        });
        this.sharingLinkCache.add(key, async () => newLinkPromise);
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
