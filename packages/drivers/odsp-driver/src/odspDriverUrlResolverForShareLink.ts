/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { PromiseCache } from "@fluidframework/common-utils";
import { IFluidCodeDetails, IRequest, isFluidPackage } from "@fluidframework/core-interfaces";
import {
    IContainerPackageInfo,
    IResolvedUrl,
    IUrlResolver,
} from "@fluidframework/driver-definitions";
import { ITelemetryBaseLogger, ITelemetryLogger } from "@fluidframework/common-definitions";
import { NonRetryableError } from "@fluidframework/driver-utils";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import {
    IOdspResolvedUrl,
    IdentityType,
    isTokenFromCache,
    OdspResourceTokenFetchOptions,
    TokenFetcher,
    OdspErrorType,
} from "@fluidframework/odsp-driver-definitions";
import {
    getLocatorFromOdspUrl,
    storeLocatorInOdspUrl,
    encodeOdspFluidDataStoreLocator,
    locatorQueryParamName,
} from "./odspFluidFileLink";
import { OdspFluidDataStoreLocator, SharingLinkHeader } from "./contractsPublic";
import { createOdspUrl } from "./createOdspUrl";
import { OdspDriverUrlResolver } from "./odspDriverUrlResolver";
import { getOdspResolvedUrl, createOdspLogger } from "./odspUtils";
import { getFileLink } from "./getFileLink";
import { pkgVersion as driverVersion } from "./packageVersion";

/**
 * Properties passed to the code responsible for fetching share link for a file.
 */
export interface ShareLinkFetcherProps {
    /**
     * Callback method that is used to fetch access token necessary to call API that produces share link
     */
    tokenFetcher: TokenFetcher<OdspResourceTokenFetchOptions>;
    /**
     * Identity type determining the shape of share link as it differs for Enterprise and Consumer users.
     */
    identityType: IdentityType;
}

/**
 * Resolver to resolve urls like the ones created by createOdspUrl which is driver inner
 * url format and the ones which have things like driveId, siteId, itemId etc encoded in nav param.
 * This resolver also handles share links and try to generate one for the use by the app.
 */
export class OdspDriverUrlResolverForShareLink implements IUrlResolver {
    private readonly logger: ITelemetryLogger;
    private readonly sharingLinkCache = new PromiseCache<string, string>();
    private readonly shareLinkFetcherProps: ShareLinkFetcherProps | undefined;

    /**
     * Creates url resolver instance
     * @param shareLinkFetcherProps - properties used when fetching share link.
     * Can be set as 'undefined' for cases where share link is not needed. Currently, only
     * getAbsoluteUrl() method requires share link.
     * @param logger - logger object that is used as telemetry sink
     * @param appName - application name hint that is encoded with url produced by getAbsoluteUrl() method.
     * This hint is used by link handling logic which determines which app to redirect to when user
     * navigates directly to the link.
     */
    public constructor(
        shareLinkFetcherProps?: ShareLinkFetcherProps | undefined,
        logger?: ITelemetryBaseLogger,
        private readonly appName?: string,
    ) {
        this.logger = createOdspLogger(logger);
        if (shareLinkFetcherProps) {
            this.shareLinkFetcherProps = {
                ...shareLinkFetcherProps,
                tokenFetcher: this.toInstrumentedTokenFetcher(this.logger, shareLinkFetcherProps.tokenFetcher),
            };
        }
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
                requestToBeResolved.url = createOdspUrl(odspFluidInfo);
            }
        } catch {
            // If the locator throws some error, then try to resolve the request as it is.
        }

        const odspResolvedUrl = await new OdspDriverUrlResolver().resolve(requestToBeResolved);

        if (isSharingLinkToRedeem) {
            // We need to remove the nav param if set by host when setting the sharelink as otherwise the shareLinkId
            // when redeeming the share link during the redeem fallback for trees latest call becomes greater than
            // the eligible length.
            odspResolvedUrl.shareLinkInfo = Object.assign(odspResolvedUrl.shareLinkInfo || {},
                {sharingLinkToRedeem: this.removeNavParam(request.url)});
        }
        if (odspResolvedUrl.itemId) {
            // Kick start the sharing link request if we don't have it already as a performance optimization.
            // For detached create new, we don't have an item id yet and therefore cannot generate a share link
            this.getShareLinkPromise(odspResolvedUrl).catch(() => {});
        }
        return odspResolvedUrl;
    }

    private removeNavParam(link: string): string {
        const url = new URL(link);
        const params = new URLSearchParams(url.search);
        params.delete(locatorQueryParamName);
        url.search = params.toString();
        return url.href;
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
                        throw new NonRetryableError(
                            "shareLinkTokenIsNull",
                            "Token callback returned null",
                            OdspErrorType.fetchTokenError,
                            { driverVersion });
                    }
                    event.end({ fromCache: isTokenFromCache(tokenResponse) });
                    return tokenResponse;
                }));
        };
    }

    private async getShareLinkPromise(resolvedUrl: IOdspResolvedUrl): Promise<string> {
        if (this.shareLinkFetcherProps === undefined) {
            throw new Error("Failed to get share link because share link fetcher props are missing");
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
            this.shareLinkFetcherProps.tokenFetcher,
            resolvedUrl,
            this.shareLinkFetcherProps.identityType,
            this.logger,
        ).catch((error) => {
            // This should imply that error is a non-retriable error.
            this.logger.sendErrorEvent({ eventName: "FluidFileUrlError" }, error);
            this.sharingLinkCache.remove(key);
            throw error;
        });
        this.sharingLinkCache.add(key, async () => newLinkPromise);
        return newLinkPromise;
    }

    /**
     * Requests a driver + data store storage URL. Note that this method requires share link to be fetched
     * and it will throw in case share link fetcher props were not specified when instance was created.
     * @param resolvedUrl - The driver resolved URL
     * @param request - The relative data store path URL. For requesting a driver URL, this value should always be '/'
     */
    public async getAbsoluteUrl(
        resolvedUrl: IResolvedUrl,
        dataStorePath: string,
        packageInfoSource?: IContainerPackageInfo | IFluidCodeDetails,
    ): Promise<string> {
        const odspResolvedUrl = getOdspResolvedUrl(resolvedUrl);
        const shareLink = await this.getShareLinkPromise(odspResolvedUrl);
        const shareLinkUrl = new URL(shareLink);

        // back-compat: IFluidCodeDetails usage to be removed in 0.58.0
        let containerPackageName;
        if (packageInfoSource && "name" in packageInfoSource) {
            containerPackageName = packageInfoSource.name
        } else if (isFluidPackage(packageInfoSource?.package)) {
            containerPackageName = packageInfoSource?.package.name
        } else {
            containerPackageName = packageInfoSource?.package
        }
        containerPackageName = containerPackageName ?? odspResolvedUrl.codeHint?.containerPackageName

        storeLocatorInOdspUrl(shareLinkUrl, {
            siteUrl: odspResolvedUrl.siteUrl,
            driveId: odspResolvedUrl.driveId,
            itemId: odspResolvedUrl.itemId,
            dataStorePath,
            appName: this.appName,
            containerPackageName,
            fileVersion: odspResolvedUrl.fileVersion,
        });

        return shareLinkUrl.href;
    }

    /**
     * Crafts a supported document/driver URL
     */
    public static createDocumentUrl(baseUrl: string, driverInfo: OdspFluidDataStoreLocator) {
        const url = new URL(baseUrl);

        storeLocatorInOdspUrl(url, driverInfo);

        return url.href;
    }

    /**
     * Crafts a supported data store nav param
     */
    public static createNavParam(locator: OdspFluidDataStoreLocator) {
        return encodeOdspFluidDataStoreLocator(locator);
    }
}
