/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/core-interfaces";
import { IContainerPackageInfo, IResolvedUrl, IUrlResolver, } from "@fluidframework/driver-definitions";
import { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions";

export class FakeUrlResolver implements IUrlResolver {

    public async resolve(request: IRequest): Promise<IResolvedUrl | undefined> {
        const fakeOdspResolvedUrl: IOdspResolvedUrl = {
            type: "fluid",
            odspResolvedUrl: true,
            id: "1",
            siteUrl: request.url,
            driveId: "1",
            itemId: "1",
            url: request.url,
            hashedDocumentId: "1",
            endpoints: {
                snapshotStorageUrl: request.url,
                attachmentPOSTStorageUrl: request.url,
                attachmentGETStorageUrl: request.url,
                deltaStorageUrl: request.url,
            },
            tokens: {},
            fileName: "fakeName",
            summarizer: false,
            fileVersion: "1",
        };

        return fakeOdspResolvedUrl;
    }

    public async getAbsoluteUrl(
        _resolvedUrl: IResolvedUrl,
        _relativeUrl: string,
        _packageInfoSource?: IContainerPackageInfo,
    ): Promise<string> {
        return "";
    }
}
