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
	locatorQueryParamName,
} from "./odspFluidFileLink.js";
import { OdspFluidDataStoreLocator, SharingLinkHeader } from "./contractsPublic.js";
import { createOdspUrl } from "./createOdspUrl.js";
import { OdspDriverUrlResolver } from "./odspDriverUrlResolver.js";
import { getOdspResolvedUrl, createOdspLogger } from "./odspUtils.js";
import { getFileLink } from "./getFileLink.js";

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

// back-compat: GitHub #9653
const isFluidPackage = (pkg: Record<string, unknown>): boolean =>
	typeof pkg === "object" && typeof pkg?.name === "string" && typeof pkg?.fluid === "object";

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
			for (const [key, value] of queryParams.entries()) {
				parsingUrl.searchParams.append(key, value);
			}
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

		return this.appendLocatorParams(shareLink, resolvedUrl, dataStorePath, packageInfoSource);
	}

	/**
	 * Appends the store locator properties to the provided base URL. This function is useful for scenarios where an application
	 * has a base URL (for example a sharing link) of the Fluid file, but does not have the locator information that would be used by Fluid
	 * to load the file later.
	 * @param baseUrl - The input URL on which the locator params will be appended.
	 * @param resolvedUrl - odsp-driver's resolvedURL object.
	 * @param dataStorePath - The relative data store path URL.
	 * For requesting a driver URL, this value should always be '/'. If an empty string is passed, then dataStorePath
	 * will be extracted from the resolved url if present.
	 * @returns The provided base URL appended with odsp-specific locator information
	 */
	public async appendLocatorParams(
		baseUrl: string,
		resolvedUrl: IResolvedUrl,
		dataStorePath: string,
		packageInfoSource?: IContainerPackageInfo,
	): Promise<string> {
		const url = new URL(baseUrl);
		const odspResolvedUrl = getOdspResolvedUrl(resolvedUrl);

		// If the user has passed an empty dataStorePath, then extract it from the resolved url.
		const actualDataStorePath = dataStorePath || (odspResolvedUrl.dataStorePath ?? "");

		let containerPackageName: string | undefined;
		if (packageInfoSource && "name" in packageInfoSource) {
			containerPackageName = packageInfoSource.name;
			// packageInfoSource is cast to any as it is typed to IContainerPackageInfo instead of IFluidCodeDetails
			// TODO: use a stronger type
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		} else if (isFluidPackage((packageInfoSource as any)?.package)) {
			// TODO: use a stronger type
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
			containerPackageName = (packageInfoSource as any)?.package.name;
		} else {
			// TODO: use a stronger type
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
			containerPackageName = (packageInfoSource as any)?.package;
		}
		// TODO: use a stronger type
		containerPackageName =
			containerPackageName ?? odspResolvedUrl.codeHint?.containerPackageName;

		const context = await this.getContext?.(odspResolvedUrl, actualDataStorePath);

		storeLocatorInOdspUrl(url, {
			siteUrl: odspResolvedUrl.siteUrl,
			driveId: odspResolvedUrl.driveId,
			itemId: odspResolvedUrl.itemId,
			dataStorePath: actualDataStorePath,
			appName: this.appName,
			containerPackageName,
			fileVersion: odspResolvedUrl.fileVersion,
			context,
		});

		return url.href;
	}

	/**
	 * Crafts a supported document/driver URL
	 */
	public static createDocumentUrl(
		baseUrl: string,
		driverInfo: OdspFluidDataStoreLocator,
	): string {
		const url = new URL(baseUrl);

		storeLocatorInOdspUrl(url, driverInfo);

		return url.href;
	}
}
