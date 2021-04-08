/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
//import jwt from "jsonwebtoken";
import { IRuntimeFactory } from "@fluidframework/container-definitions";
//import { IUrlResolver, IFluidResolvedUrl, IResolvedUrl } from "@fluidframework/driver-definitions";
//import { IRequest } from "@fluidframework/core-interfaces";
// import { getContainer } from "@fluidframework/get-tinylicious-container";
import { getContainer } from "@fluid-experimental/get-container";
import { InsecureTinyliciousTokenProvider, InsecureTinyliciousUrlResolver } from "@fluidframework/tinylicious-driver";


/*class RouterliciousUrlResolver implements IUrlResolver {
    constructor(private readonly token: string, private readonly tenant: string) {
    }

    public async resolve(request: IRequest): Promise<IFluidResolvedUrl> {
        const documentUrl = `${process.env.ORDERER}/${this.tenant}/${request.url}`;

        return Promise.resolve({
            endpoints: {
                deltaStorageUrl: `${process.env.ORDERER}/deltas/${this.tenant}/${request.url}`,
                ordererUrl: `${process.env.ORDERER}`,
                storageUrl: `${process.env.STORAGE}/repos/${this.tenant}`,
            },
            tokens: { jwt: this.token },
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
}*/

export async function getFRSContainer(
    documentId: string,
    containerRuntimeFactory: IRuntimeFactory,
    createNew: boolean,
) {
    if (process.env.ID === undefined) throw Error("Define ID in .env file");
    if (process.env.KEY === undefined) throw Error("Define KEY in .env file");
    if (process.env.ORDERER === undefined) throw Error("Define ORDERER in .env file");
    if (process.env.STORAGE === undefined) throw Error("Define STORAGE in .env file");

    const tokenProvider = new InsecureTinyliciousTokenProvider();
    const documentServiceFactory = new RouterliciousDocumentServiceFactory(tokenProvider);

    /*const user = {
        id: "unique-id",
        name: "Unique Idee",
    };

    const tenantId = process.env.ID;
    const key = process.env.KEY;
    const hostToken = jwt.sign(
        {
            user,
            documentId,
            tenantId: tenantId,
            scopes: ["doc:read", "doc:write", "summary:write"],
        },
        key);*/

    const urlResolver = new InsecureTinyliciousUrlResolver();

    return getContainer(
        documentId,
        createNew,
        { url: documentId },
        urlResolver,
        documentServiceFactory,
        containerRuntimeFactory,
    );
}

export function hasFRSEndpoints() {
    try {
        if (process.env.ID === undefined) throw Error("Define ID in .env file");
        if (process.env.KEY === undefined) throw Error("Define KEY in .env file");
        if (process.env.ORDERER === undefined) throw Error("Define ORDERER in .env file");
        if (process.env.STORAGE === undefined) throw Error("Define STORAGE in .env file");
    } catch {
        return false;
    }
    return true;
}
