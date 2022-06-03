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

// Implementation of a URL resolver to resolve documents stored using the Azure Fluid Relay
// based off of the orderer and storage URLs provide. The token provider here can be a
// InsecureTokenProvider for basic scenarios or more robust, secure providers that fulfill the
// ITokenProvider interface
export class AzureUrlResolver implements IUrlResolver {
    constructor() { }

    public async resolve(request: IRequest): Promise<IFluidResolvedUrl> {
        const { ordererUrl, storageUrl, tenantId, containerId } = decodeAzureUrl(
            request.url,
        );
        // determine whether the request is for creating of a new container.
        // such request has the `createNew` header set to true and doesn't have a container ID.
        if (
            request.headers &&
            request.headers[DriverHeader.createNew] === true
        ) {
            return {
                endpoints: {
                    deltaStorageUrl: `${ordererUrl}/deltas/${tenantId}/new`,
                    ordererUrl,
                    storageUrl: `${storageUrl}/repos/${tenantId}`,
                },
                // id is a mandatory attribute, but it's ignored by the driver for new container requests.
                id: "",
                // tokens attribute is redundant as all tokens are generated via ITokenProvider
                tokens: {},
                type: "fluid",
                url: `${ordererUrl}/${tenantId}/new`,
            };
        }
        if (containerId === undefined) {
            throw new Error("Azure URL did not contain containerId");
        }
        const documentUrl = `${ordererUrl}/${tenantId}/${containerId}`;
        return Promise.resolve({
            endpoints: {
                deltaStorageUrl: `${ordererUrl}/deltas/${tenantId}/${containerId}`,
                ordererUrl,
                storageUrl: `${storageUrl}/repos/${tenantId}`,
            },
            id: containerId,
            tokens: {},
            type: "fluid",
            url: documentUrl,
        });
    }

    public async getAbsoluteUrl(
        resolvedUrl: IResolvedUrl,
        relativeUrl: string,
    ): Promise<string> {
        if (resolvedUrl.type !== "fluid") {
            throw Error("Invalid Resolved Url");
        }
        return `${resolvedUrl.url}/${relativeUrl}`;
    }
}

function decodeAzureUrl(urlString: string): {
    ordererUrl: string;
    storageUrl: string;
    tenantId: string;
    containerId?: string;
} {
    const url = new URL(urlString);
    const ordererUrl = url.origin;
    const searchParams = url.searchParams;
    const storageUrl = searchParams.get("storage");
    if (storageUrl === null) {
        throw new Error("Azure URL did not contain a storage URL");
    }
    const tenantId = searchParams.get("tenantId");
    if (tenantId === null) {
        throw new Error("Azure URL did not contain a tenant ID");
    }
    const storageUrlDecoded = decodeURIComponent(storageUrl);
    const tenantIdDecoded = decodeURIComponent(tenantId);
    const containerId = searchParams.get("containerId");
    const containerIdDecoded = containerId !== null ? decodeURIComponent(containerId) : undefined;
    return {
        ordererUrl,
        storageUrl: storageUrlDecoded,
        tenantId: tenantIdDecoded,
        containerId: containerIdDecoded,
    };
}

export const createAzureCreateNewRequest = (
    endpointUrl: string,
    tenantId: string,
): IRequest => {
    const url = new URL(endpointUrl);
    url.searchParams.append("storage", encodeURIComponent(endpointUrl));
    url.searchParams.append("tenantId", encodeURIComponent(tenantId));
    return {
        url: url.href,
        headers: {
            [DriverHeader.createNew]: true,
        },
    };
};
