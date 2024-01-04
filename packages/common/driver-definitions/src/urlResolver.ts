/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IRequest } from "@fluidframework/core-interfaces";

/**
 * @alpha
 */
export interface IResolvedUrl {
	type: "fluid";
	/**
	 * The id of the container this resolved url is for.
	 */
	id: string;
	url: string;
	tokens: { [name: string]: string };
	endpoints: { [name: string]: string };
}

/**
 * Container package info handed off to resolver.
 * @alpha
 */
export interface IContainerPackageInfo {
	/**
	 * Container package name.
	 */
	name: string;
}

/**
 * @alpha
 */
export interface IUrlResolver {
	// Like DNS should be able to cache resolution requests. Then possibly just have a token provider go and do stuff?
	// the expiration of it could be relative to the lifetime of the token? Requests after need to refresh?
	// or do we split the token access from this?
	resolve(request: IRequest): Promise<IResolvedUrl | undefined>;

	/**
	 * Creates a url for the created container with any data store path given in the relative url.
	 * @param resolvedUrl - resolved url for the container.
	 * @param relativeUrl - relative url containing data store path; '/' represents root path.
	 * @param packageInfoSource - optional, represents container package information to be included in url.
	 * @returns absolute url combining container url with dta store path and optional additional information.
	 */
	getAbsoluteUrl(
		resolvedUrl: IResolvedUrl,
		relativeUrl: string,
		packageInfoSource?: IContainerPackageInfo,
	): Promise<string>;
}

/**
 * Information that can be returned by a lightweight, seperately exported driver function. Used to preanalyze a URL
 * for driver compatibility and preload information.
 * @alpha
 */
export interface DriverPreCheckInfo {
	/**
	 * A code details hint that can potentially be used to prefetch container code prior to having a snapshot.
	 */
	codeDetailsHint?: string;

	/**
	 * Domains that will be connected to on the critical boot path. Hosts can choose to preconnect to these for
	 * improved performance.
	 */
	criticalBootDomains?: string[];
}

/**
 * Additional key in the loader request header
 * @alpha
 */
export enum DriverHeader {
	// Key to indicate whether the request for summarizer
	summarizingClient = "fluid-client-summarizer",
	// createNew information, specific to each driver
	createNew = "createNew",
}

/**
 * @internal
 */
export interface IDriverHeader {
	[DriverHeader.summarizingClient]: boolean;
	// TODO: Use something other than `any`.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[DriverHeader.createNew]: any;
}

declare module "@fluidframework/core-interfaces" {
	// eslint-disable-next-line @typescript-eslint/no-empty-interface
	export interface IRequestHeader extends Partial<IDriverHeader> {}
}
