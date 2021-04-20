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
        deltaStorageUrl: string,
    };

    // Tokens are not obtained by the ODSP driver using the resolve flow, the app must provide them.
    // eslint-disable-next-line @typescript-eslint/ban-types
    tokens: {};

    fileName: string;

    summarizer: boolean;

    // This is used to save the network calls while doing trees/latest call as if the client does not have permission
    // then this link can be redeemed for the permissions in the same network call.
    sharingLinkToRedeem?: string;

    codeHint?: {
        // containerPackageName is used for adding the package name to the request headers.
        // This may be used for preloading the container package when loading Fluid content.
        containerPackageName?: string
    }

    fileVersion: string | undefined;
}
