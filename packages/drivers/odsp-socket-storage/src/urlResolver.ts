/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPragueResolvedUrl, IRequest, IResolvedUrl, IUrlResolver } from "@prague/container-definitions";

export class OdspUrlResolver implements IUrlResolver {

    constructor(
        private readonly deltaStorageUrl: string,
        private readonly ordererUrl: string,
        private readonly storageUrl: string,
        private readonly storageToken: string,
        private readonly socketToken: string,
        private readonly tenantId: string,
        private readonly documentId: string,
    ) {}

    public resolve(request: IRequest): Promise<IResolvedUrl> {

        const documentUrl =
        `prague://${new URL(this.deltaStorageUrl).host}` +
        `/${encodeURIComponent(this.tenantId)}` +
        `/${encodeURIComponent(this.documentId)}` +
        "?version=null";

        const resolvedUrl: IPragueResolvedUrl = {
            endpoints: {
                deltaStorageUrl: this.deltaStorageUrl,
                ordererUrl: this.ordererUrl,
                storageUrl: this.storageUrl,
            },
            tokens: {
                socketToken: this.socketToken,
                storageToken: this.storageToken,
              },
            type: "prague",
            url: documentUrl,
        };

        return Promise.resolve(resolvedUrl);
    }
}
