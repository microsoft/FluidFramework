/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/core-interfaces";
import { IUrlResolver, IFluidResolvedUrl, IResolvedUrl } from "@fluidframework/driver-definitions";
import { ITokenProvider } from "@fluidframework/routerlicious-driver";

// Implementation of a URL resolver to resolve documents stored using the Azure Relay Service
// based off of the orderer and storage URLs provide. The token provider here can be a
// InsecureTokenProvider for basic scenarios or more robust, secure providers that fulfill the
// ITokenProvider interface
export class AzureUrlResolver implements IUrlResolver {
    constructor(
        private readonly tenantId: string,
        private readonly orderer: string,
        private readonly storage: string,
        private readonly documentId: string,
        private readonly tokenProvider: ITokenProvider,
    ) { }

    public async resolve(request: IRequest): Promise<IFluidResolvedUrl> {
        const containerId = request.url.split("/")[0];
        const token = (await this.tokenProvider.fetchOrdererToken(this.tenantId, this.documentId)).jwt;
        const documentUrl = `${this.orderer}/${this.tenantId}/${containerId}`;
        return Promise.resolve({
            endpoints: {
                deltaStorageUrl: `${this.orderer}/deltas/${this.tenantId}/${containerId}`,
                ordererUrl: `${this.orderer}`,
                storageUrl: `${this.storage}/repos/${this.tenantId}`,
            },
            id: containerId,
            tokens: { jwt: token },
            type: "fluid",
            url: documentUrl,
        });
    }
    public async getAbsoluteUrl(resolvedUrl: IResolvedUrl, relativeUrl: string): Promise<string> {
        if (resolvedUrl.type !== "fluid") {
            throw Error("Invalid Resolved Url");
        }
        return `${resolvedUrl.url}/${relativeUrl}`;
    }
}
