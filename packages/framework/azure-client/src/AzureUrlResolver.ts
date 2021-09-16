/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/core-interfaces";
import {
    DriverHeader,
    IFluidResolvedUrl,
    IResolvedUrl,
    IUrlResolver,
} from "@fluidframework/driver-definitions";

// Implementation of a URL resolver to resolve documents stored using the Azure Relay Service
// based off of the orderer and storage URLs provide. The token provider here can be a
// InsecureTokenProvider for basic scenarios or more robust, secure providers that fulfill the
// ITokenProvider interface
export class AzureUrlResolver implements IUrlResolver {
    constructor(
        private readonly tenantId: string,
        private readonly orderer: string,
        private readonly storage: string,
    ) { }

    public async resolve(request: IRequest): Promise<IFluidResolvedUrl> {
        // determine whether the request is for creating of a new container.
        // such request has the `createNew` header set to true and doesn't have a container ID.
        if (request.headers && request.headers[DriverHeader.createNew] === true) {
            return {
                endpoints: {
                    deltaStorageUrl: `${this.orderer}/deltas/${this.tenantId}/new`,
                    ordererUrl: this.orderer,
                    storageUrl: `${this.storage}/repos/${this.tenantId}`,
                },
                // id is a mandatory attribute, but it's ignored by the driver for new container requests.
                id: "",
                // tokens attribute is redundant as all tokens are generated via ITokenProvider
                tokens: {},
                type: "fluid",
                url: `${this.orderer}/${this.tenantId}/new`,
            };
        }
        // for an existing container we'll parse the request URL to determine the document ID.
        const containerId = request.url.split("/")[0];
        const documentUrl = `${this.orderer}/${this.tenantId}/${containerId}`;
        return Promise.resolve({
            endpoints: {
                deltaStorageUrl: `${this.orderer}/deltas/${this.tenantId}/${containerId}`,
                ordererUrl: this.orderer,
                storageUrl: `${this.storage}/repos/${this.tenantId}`,
            },
            id: containerId,
            tokens: {},
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

export const createAzureCreateNewRequest = (): IRequest => (
    {
        url: "",
        headers: {
            [DriverHeader.createNew]: true,
        },
    }
);
