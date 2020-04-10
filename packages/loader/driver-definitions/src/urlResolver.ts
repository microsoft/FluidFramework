/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { INewFileParams } from "./newFileParams";

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
    url: string;
    tokens: { [name: string]: string };
    endpoints: { [name: string]: string };
    siteUrl?: string,
    newFileParams?: INewFileParams;
}

export enum OpenMode {
    CreateNew,
    OpenExisting,
}

export interface IUrlResolver {

    // Like DNS should be able to cache resolution requests. Then possibly just have a token provider go and do stuff?
    // the expiration of it could be relative to the lifetime of the token? Requests after need to refresh?
    // or do we split the token access from this?
    resolve(request: IRequest): Promise<IResolvedUrl | undefined>;
}

export interface IExperimentalUrlResolver extends IUrlResolver {
    readonly isExperimentalUrlResolver: true;
    // Creates a url for the created container.
    createUrl(
        resolvedUrl: IResolvedUrl,
        request: IRequest,
    ): string;
}
