/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { PromiseCache } from "@fluidframework/core-utils";
import { ITelemetryBaseLogger, IRequest } from "@fluidframework/core-interfaces";
import {
	IContainerPackageInfo,
	IResolvedUrl,
	IUrlResolver,
} from "@fluidframework/driver-definitions";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils";
import {
	IOdspResolvedUrl,
	IdentityType,
	OdspResourceTokenFetchOptions,
	TokenFetcher,
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

/**
 * Properties passed to the code responsible for fetching share link for a file.
 * @alpha
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
 * @alpha
 */
export class OdspDriverUrlResolverForShareLink implements IUrlResolver {
	private readonly logger: ITelemetryLoggerExt;
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
	 * @param getContext - callback function which is used to get context for given resolved url. If context
	 * is returned then it will be embedded into url returned by getAbsoluteUrl() method.
	 */
	public constructor(
		shareLinkFetcherProps?: ShareLinkFetcherProps | undefined,
		logger?: ITelemetryBaseLogger,
		private readonly appName?: string,
		private readonly getContext?: (
			resolvedUrl: IOdspResolvedUrl,
			dataStorePath: string,
		) => Promise<string | undefined>,
	) {
		this.logger = createOdspLogger(logger);
		if (shareLinkFetcherProps) {
			this.shareLinkFetcherProps = {
				...shareLinkFetcherProps,
				tokenFetcher: shareLinkFetcherProps.tokenFetcher,
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

		const parsingUrl = new URL(
			fluidInfo.dataStorePath,
			`${requestUrl.protocol}//${requestUrl.hostname}`,
		);
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
		const isSharingLinkToRedeem =
			requestToBeResolved.headers?.[SharingLinkHeader.isSharingLinkToRedeem];
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
			odspResolvedUrl.shareLinkInfo = Object.assign(odspResolvedUrl.shareLinkInfo ?? {}, {
				sharingLinkToRedeem: this.removeNavParam(request.url),
			});
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

	private async getShareLinkPromise(resolvedUrl: IOdspResolvedUrl): Promise<string> {
		if (this.shareLinkFetcherProps === undefined) {
			throw new Error(
				"Failed to get share link because share link fetcher props are missing",
			);
		}

		if (!(resolvedUrl.siteUrl && resolvedUrl.driveId && resolvedUrl.itemId)) {
			throw new Error(
				"Failed to get share link because necessary information is missing " +
					"(e.g. siteUrl, driveId or itemId)",
			);
		}

		const key = this.getKey(resolvedUrl);
		const cachedLinkPromise = this.sharingLinkCache.get(key);
		if (cachedLinkPromise) {
			return cachedLinkPromise;
		}
		const newLinkPromise = getFileLink(
			this.shareLinkFetcherProps.tokenFetcher,
			resolvedUrl,
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
	 * @param dataStorePath - The relative data store path URL.
	 * For requesting a driver URL, this value should always be '/'. If an empty string is passed, then dataStorePath
	 * will be extracted from the resolved url if present.
	 * @param packageInfoSource - optional, represents container package information to be included in url.
	 */
	public async getAbsoluteUrl(
		resolvedUrl: IResolvedUrl,
		dataStorePath: string,
		packageInfoSource?: IContainerPackageInfo,
	): Promise<string> {
		const odspResolvedUrl = getOdspResolvedUrl(resolvedUrl);

		const shareLink = await this.getShareLinkPromise(odspResolvedUrl);
		const shareLinkUrl = new URL(shareLink);

		let actualDataStorePath = dataStorePath;
		// If the user has passed an empty dataStorePath, then extract it from the resolved url.
		if (dataStorePath === "" && odspResolvedUrl.dataStorePath !== undefined) {
			actualDataStorePath = odspResolvedUrl.dataStorePath;
		}

		// back-compat: GitHub #9653
		const isFluidPackage = (pkg: any) =>
			typeof pkg === "object" &&
			typeof pkg?.name === "string" &&
			typeof pkg?.fluid === "object";
		let containerPackageName;
		if (packageInfoSource && "name" in packageInfoSource) {
			containerPackageName = packageInfoSource.name;
			// packageInfoSource is cast to any as it is typed to IContainerPackageInfo instead of IFluidCodeDetails
		} else if (isFluidPackage((packageInfoSource as any)?.package)) {
			containerPackageName = (packageInfoSource as any)?.package.name;
		} else {
			containerPackageName = (packageInfoSource as any)?.package;
		}
		containerPackageName =
			containerPackageName ?? odspResolvedUrl.codeHint?.containerPackageName;

		const context = await this.getContext?.(odspResolvedUrl, actualDataStorePath);

		storeLocatorInOdspUrl(shareLinkUrl, {
			siteUrl: odspResolvedUrl.siteUrl,
			driveId: odspResolvedUrl.driveId,
			itemId: odspResolvedUrl.itemId,
			dataStorePath: actualDataStorePath,
			appName: this.appName,
			containerPackageName,
			fileVersion: odspResolvedUrl.fileVersion,
			context,
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
	 * @deprecated encodeOdspFluidDataStoreLocator should be used instead
	 */
	public static createNavParam(locator: OdspFluidDataStoreLocator) {
		return encodeOdspFluidDataStoreLocator(locator);
	}
}
