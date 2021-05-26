/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest, IFluidCodeDetails } from "@fluidframework/core-interfaces";

export type IResolvedUrl = IWebResolvedUrl | IFluidResolvedUrl;

export interface IResolvedUrlBase {
    type: string;
}

export interface IWebResolvedUrl extends IResolvedUrlBase {
    type: "web";
    data: string;
}

export interface IFluidResolvedUrl extends IResolvedUrlBase {
    type: "fluid";
    /**
     * The id of the container this resolved url is for.
     */
    id: string,
    url: string;
    tokens: { [name: string]: string };
    endpoints: { [name: string]: string };
}

export interface IUrlResolver {

    // Like DNS should be able to cache resolution requests. Then possibly just have a token provider go and do stuff?
    // the expiration of it could be relative to the lifetime of the token? Requests after need to refresh?
    // or do we split the token access from this?
    resolve(request: IRequest): Promise<IResolvedUrl | undefined>;

    // Creates a url for the created container with any data store path given in the relative url.
    getAbsoluteUrl(
        resolvedUrl: IResolvedUrl,
        relativeUrl: string,
        codeDetails?: IFluidCodeDetails,
    ): Promise<string>;
}

/**
* Information that can be returned by a lightweight, seperately exported driver function. Used to preanalyze a URL
* for driver compatibility and preload information.
*/
export interface DriverPreCheckInfo {
    /**
     * @deprecated - only needed as long as long as Loader.request() does not work as intended. When
     * Loader.request() caches and resolves pathing properly, this can be removed. #4489, #4491
     */
    containerPath: string;

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
 */
export enum DriverHeader {
    // Key to indicate whether the request for summarizer
    summarizingClient = "fluid-client-summarizer",
    // createNew information, specific to each driver
    createNew = "createNew",
}

export interface IDriverHeader {
    [DriverHeader.summarizingClient]: boolean;
    [DriverHeader.createNew]: any;
}

declare module "@fluidframework/core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IRequestHeader extends Partial<IDriverHeader> { }
}
