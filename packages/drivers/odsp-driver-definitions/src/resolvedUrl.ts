/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidResolvedUrl } from "@fluidframework/driver-definitions";

export interface IOdspUrlParts {
    siteUrl: string;
    driveId: string;
    itemId: string;
}

/**
 * @deprecated Use ISharingLinkKind type instead.
 * Type of shareLink requested/created when creating the file for the first time.
*/
export enum ShareLinkTypes {
    csl = "csl",
}

/**
 * Sharing scope of the share links created for a file.
*/
export enum SharingLinkScope {
    organization = "organization",
    users = "users",
    anonymous = "anonymous",
    default = "default",
}

/**
 * View/edit permission role for a sharing link.
 */
export enum SharingLinkRole {
    view = "view",
    edit = "edit",
}

/**
 * Defines the permissions scope for a share link requested to be created during the creation the file in ODSP.
 * Providing these properties to the /snapshot api will also create and return the requested kind of sharing link.
*/
export interface ISharingLinkKind {
    scope: SharingLinkScope;
    /*
     * If this parameter is not provided, the API will default to "edit" links (provided
     * a valid createLinkScope setting is given).
    */
    role?: SharingLinkRole;
}

/**
 * Sharing link data received from the /snapshot api response.
 */
export interface ISharingLink extends ISharingLinkKind {
    webUrl: string;
}

/**
 * Sharing link data created for the ODSP item.
 * Contains information about either sharing link created while creating a new file or
 * a redeemable share link created when loading an existing file
 */
export interface ShareLinkInfoType {

    /**
     * We create a new file in ODSP with the /snapshot api call. Applications then need to make a separate apis call to
     * create a sharing link for that file. To reduce the number of network calls, ODSP now provides a feature
     * where we can create a share link along with creating a file by passing a query parameter called
     * createShareLink (deprecated) or createLinkScope and createLinkRole. createLink object below saves the information
     * from the /snapshot api response.
     */
    createLink?: {
        /**
         * @deprecated
         * Type of shareLink requested/created when creating the file for the first time. The 'type' property here
         * represents the type of sharing link requested.
         * Will be deprecated soon. Type of sharing link will be present in the link:ISharingLink property below.
        */
        type?: ShareLinkTypes | ISharingLinkKind;

        /**
         * Share link created when the file is created for the first time with /snapshot api call.
         */
        link?: string | ISharingLink;

        /**
         * Error message if creation of sharing link fails with /snapshot api call
         */
        error?: any;

        shareId?: string;

    };

    /**
     * This is used to save the network calls while doing trees/latest call as if the client does not have
     * permission then this link can be redeemed for the permissions in the same network call.
     */
    sharingLinkToRedeem?: string;
}
export interface IOdspResolvedUrl extends IFluidResolvedUrl, IOdspUrlParts {
    type: "fluid";
    odspResolvedUrl: true;

    // URL to send to fluid, contains the documentId and the path
    url: string;

    // A hashed identifier that is unique to this document
    hashedDocumentId: string;

    endpoints: {
        snapshotStorageUrl: string;
        attachmentPOSTStorageUrl: string;
        attachmentGETStorageUrl: string;
        deltaStorageUrl: string;
    };

    // Tokens are not obtained by the ODSP driver using the resolve flow, the app must provide them.
    // eslint-disable-next-line @typescript-eslint/ban-types
    tokens: {};

    fileName: string;

    summarizer: boolean;

    codeHint?: {
        // containerPackageName is used for adding the package name to the request headers.
        // This may be used for preloading the container package when loading Fluid content.
        containerPackageName?: string;
    };

    fileVersion: string | undefined;

    /**
     * Sharing link data created for the ODSP item.
     * Contains information about either sharing link created while creating a new file or
     * a redeemable share link created when loading an existing file
     */
    shareLinkInfo?: ShareLinkInfoType;

    isClpCompliantApp?: boolean;
}
