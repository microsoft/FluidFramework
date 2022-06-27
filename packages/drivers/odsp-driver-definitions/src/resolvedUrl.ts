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
 * Type of shareLink requested/created when creating the file for the first time.
 * At the time of adding this comment (Sept/2021) ODSP only supports creation of CSL links
 * when provided as a request parameter with the /snapshot api call.
 * In future, we can add more types here.
*/
export enum ShareLinkTypes {
    csl = "csl",
}
/**
 * Sharing link data created for the ODSP item.
 * Contains information about either sharing link created while creating a new file or
 * a redeemable share link created when loading an existing file
 */
export interface ShareLinkInfoType {

    /**
     * We create a new file in ODSP with the /snapshot api call. Applications then call separate apis to
     * create a sharing link for that file. To reduce the number of api calls, ODSP now provides a feature
     * where we can create a share link along with creating a file by passing a query parameter called
     * createShareLink. createLink object below saves the data corresponding to this feature.
     */
    createLink?: {
        /**
         * Type of shareLink requested/created when creating the file for the first time.
         * At the time of adding this comment (Sept/2021) ODSP only supports creation of CSL links
         * when provided as a request parameter with the /snapshot api call.
        */
        type?: ShareLinkTypes;

        /**
         * Share link created when the file is created for the first time with /snapshot api call.
         * This link does not require redemption.
         */
        link?: string;

        /**
         * Error message if creation of sharing link fails with /snapshot api call
         */
        error?: any;
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
