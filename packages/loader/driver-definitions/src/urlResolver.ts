/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest, IResponse } from "@microsoft/fluid-component-core-interfaces";

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
}

export interface IUrlResolver {

    // Like DNS should be able to cache resolution requests. Then possibly just have a token provider go and do stuff?
    // the expiration of it could be relative to the lifetime of the token? Requests after need to refresh?
    // or do we split the token access from this?
    resolve(request: IRequest): Promise<IResolvedUrl | undefined>;

    // Creates a url for the created container with any component path given in request.
    requestUrl(
        resolvedUrl: IResolvedUrl,
        request: IRequest,
    ): Promise<IResponse>;
}

export enum CreateNewHeader {
    createNew = "createNew",
}

export interface ICreateNewHeader {
    [CreateNewHeader.createNew]: any;
}

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IRequestHeader extends Partial<ICreateNewHeader> { }
}
