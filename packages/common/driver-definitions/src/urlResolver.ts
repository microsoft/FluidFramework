/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IRequest } from "@fluidframework/core-interfaces";

/**
 * TODO
 */
export type IResolvedUrl = IWebResolvedUrl | IFluidResolvedUrl;

/**
 * Shared base implementation for {@link IResolvedUrl}s.
 */
export interface IResolvedUrlBase {
	/**
	 * TODO
	 */
	type: string;
}

export interface IWebResolvedUrl extends IResolvedUrlBase {
	/**
	 * {@inheritDoc IResolvedUrlBase.type}
	 */
	type: "web";
	
	/**
	 * TODO
	 */
	data: string;
}

export interface IFluidResolvedUrl extends IResolvedUrlBase {
	/**
	 * {@inheritDoc IResolvedUrlBase.type}
	 */
	type: "fluid";
	
	/**
	 * The ID of the Container this resolved URL is associated with.
	 */
	id: string;
	
	/**
	 * TODO
	 */
	url: string;
	
	/**
	 * TODO
	 */
	tokens: { 
		/**
		 * TODO
		 */
		[name: string]: string
	};
	
	/**
	 * TODO
	 */
	endpoints: {
		/**
		 * TODO
		 */
		[name: string]: string
	};
}

/**
 * Container package info handed off to resolver.
 */
export interface IContainerPackageInfo {
	/**
	 * Container package name.
	 */
	name: string;
}

export interface IUrlResolver {
	/**
	 * TODO
	 * 
	 * @privateRemarks
	 * 
	 * Like DNS should be able to cache resolution requests. Then possibly just have a token provider go and do stuff?
	 * the expiration of it could be relative to the lifetime of the token? Requests after need to refresh?
	 * or do we split the token access from this?
	 */
	resolve(request: IRequest): Promise<IResolvedUrl | undefined>;

	/**
	 * Creates a URL for the created Container with any datastore path given in the relative URL.
	 * @param resolvedUrl - Resolved URL for the Container.
	 * @param relativeUrl - Relative URL containing data store path. `/` represents root path.
	 * @param packageInfoSource - (optional) Represents Container package information to be included in URL.
	 * @returns An absolute URL combining Container URL with the data store path and optional additional information.
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
 */
export interface DriverPreCheckInfo {
	/**
	 * A code details hint that can potentially be used to prefetch Container code prior to having a snapshot.
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
 */
export enum DriverHeader {
	/**
	 * Key to indicate whether the request for summarizer
	 */
	summarizingClient = "fluid-client-summarizer",
	
	/**
	 * createNew information, specific to each driver
	 */
	createNew = "createNew",
}

/**
 * TODO
 */
export interface IDriverHeader {
	/**
	 * TODO
	 */
	[DriverHeader.summarizingClient]: boolean;
	/**
	 * TODO
	 */
	// TODO: Use something other than `any`.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[DriverHeader.createNew]: any;
}

declare module "@fluidframework/core-interfaces" {
	/**
	 * TODO
	 */
	// eslint-disable-next-line @typescript-eslint/no-empty-interface
	export interface IRequestHeader extends Partial<IDriverHeader> {}
}
