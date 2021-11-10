/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IOdspUrlParts } from "@fluidframework/odsp-driver-definitions";

export interface OdspFluidDataStoreLocator extends IOdspUrlParts {
    dataStorePath: string;
    appName?: string;
    containerPackageName?: string;
    fileVersion?: string;
}

export enum SharingLinkHeader {
    // Can be used in request made to resolver, to tell the resolver that the passed in URL is a sharing link
    // which can be redeemed at server to get permissions.
    isSharingLinkToRedeem = "isSharingLinkToRedeem",
}

export interface ISharingLinkHeader {
    [SharingLinkHeader.isSharingLinkToRedeem]: boolean;
}

declare module "@fluidframework/core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IRequestHeader extends Partial<ISharingLinkHeader> { }
}
