/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IRequest, IFluidCodeDetails } from "@fluidframework/core-interfaces";
export declare type IResolvedUrl = IWebResolvedUrl | IFluidResolvedUrl;
export interface IResolvedUrlBase {
    type: string;
}
export interface IWebResolvedUrl extends IResolvedUrlBase {
    type: "web";
    data: string;
}
export interface IFluidResolvedUrl extends IResolvedUrlBase {
    type: "fluid";
    url: string;
    tokens: {
        [name: string]: string;
    };
    endpoints: {
        [name: string]: string;
    };
}
export interface IUrlResolver {
    resolve(request: IRequest): Promise<IResolvedUrl | undefined>;
    getAbsoluteUrl(resolvedUrl: IResolvedUrl, relativeUrl: string, codeDetails?: IFluidCodeDetails): Promise<string>;
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
export declare enum DriverHeader {
    summarizingClient = "fluid-client-summarizer",
    createNew = "createNew"
}
export interface IDriverHeader {
    [DriverHeader.summarizingClient]: boolean;
    [DriverHeader.createNew]: any;
}
declare module "@fluidframework/core-interfaces" {
    interface IRequestHeader extends Partial<IDriverHeader> {
    }
}
//# sourceMappingURL=urlResolver.d.ts.map