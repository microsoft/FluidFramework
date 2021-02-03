/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRuntimeFactory } from "@fluidframework/container-definitions";
import { IRequest } from "@fluidframework/core-interfaces";
import { IFluidResolvedUrl, IResolvedUrl, IUrlResolver } from "@fluidframework/driver-definitions";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { InsecureTinyliciousTokenProvider } from "@fluidframework/tinylicious-driver";
import jwt from "jsonwebtoken";
import { getContainer } from "./getContainer";

interface IRouterliciousConfig {
    orderer: string,
    storage: string,
    tenant: string,
    key: string,
}

/**
 * Connect to an implementation of the Routerlicious service and retrieve a Container with
 * the given ID running the given code.
 *
 * @param containerId - The document id to retrieve or create
 * @param containerRuntimeFactory - The container factory to be loaded in the container
 * @param createNew - Is this a new container
 * @param config
 */
export async function getRouterliciousContainer(
    containerId: string,
    containerRuntimeFactory: IRuntimeFactory,
    createNew: boolean,
    config: IRouterliciousConfig,
) {
    const tokenProvider = new InsecureTinyliciousTokenProvider();
    const documentServiceFactory = new RouterliciousDocumentServiceFactory(tokenProvider);

    const urlResolver = new SimpleUrlResolver(config.orderer, config.storage, config.tenant, config.key);

    return getContainer(
        containerId,
        createNew,
        { url: containerId },
        urlResolver,
        documentServiceFactory,
        containerRuntimeFactory,
    );
}

class SimpleUrlResolver implements IUrlResolver {
    private readonly token: string;

    constructor(
        private readonly orderer: string,
        private readonly storage: string,
        private readonly tenantId: string,
        readonly key: string,
    ) {
        const user = {
            id: "unique-id",
            name: "Unique Idee",
        };
        this.token = jwt.sign(
            {
                user,
                // documentId: containerId,
                tenantId,
                scopes: ["doc:read", "doc:write", "summary:write"],
            },
            key);
    }

    public async resolve(request: IRequest): Promise<IFluidResolvedUrl> {
        const documentUrl = `${this.orderer}/${this.tenantId}/${request.url}`;

        return Promise.resolve({
            endpoints: {
                deltaStorageUrl: `${this.orderer}/deltas/${this.tenantId}/${request.url}`,
                ordererUrl: `${this.orderer}`,
                storageUrl: `${this.storage}/repos/${this.tenantId}`,
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
}
