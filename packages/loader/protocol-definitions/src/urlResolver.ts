/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@microsoft/fluid-component-core-interfaces";

export type IResolvedUrl = IWebResolvedUrl | IFluidResolvedUrl | IOdspResolvedUrl;

export interface IResolvedUrlBase {
    type: string;
}

export interface IWebResolvedUrl extends IResolvedUrlBase {
    type: "web";
    data: string;
}

export interface IFluidResolvedUrl extends IResolvedUrlBase {
    type: "fluid" | "prague";
    url: string;
    tokens: { [name: string]: string };
    endpoints: { [name: string]: string };
}

export interface IOdspResolvedUrl extends IResolvedUrlBase {
    type: "fluid" | "prague";

    // URL to send to fluid, contains the documentId and the path
    url: string;

    // A hashed identifier that is unique to this document
    hashedDocumentId: string;

    siteUrl: string;

    driveId: string;

    itemId: string;

    endpoints: {
      snapshotStorageUrl: string;
    };

    // Tokens are not obtained by the ODSP driver using the resolve flow, the app must provide them.
    tokens: {};
}

export interface IUrlResolver {
    // Like DNS should be able to cache resolution requests. Then possibly just have a token provider go and do stuff?
    // the expiration of it could be relative to the lifetime of the token? Requests after need to refresh?
    // or do we split the token access from this?
    resolve(request: IRequest): Promise<IResolvedUrl>;
}
