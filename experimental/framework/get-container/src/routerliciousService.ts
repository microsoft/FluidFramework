/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/core-interfaces";
import {
    IDocumentServiceFactory,
    IFluidResolvedUrl,
    IResolvedUrl,
    IUrlResolver,
} from "@fluidframework/driver-definitions";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils";
import { IUser } from "@fluidframework/protocol-definitions";
import jwt from "jsonwebtoken";
import { IGetContainerService } from "./getContainer";

export interface IRouterliciousConfig {
    orderer: string,
    storage: string,
    tenantId: string,
    key: string,
}

class SimpleUrlResolver implements IUrlResolver {
    constructor(
        private readonly config: IRouterliciousConfig,
        private readonly user: IUser,
    ) { }

    public async resolve(request: IRequest): Promise<IFluidResolvedUrl> {
        const containerId = request.url.split("/")[0];
        const token = jwt.sign(
            {
                user: this.user,
                documentId: containerId,
                tenantId: this.config.tenantId,
                scopes: ["doc:read", "doc:write", "summary:write"],
            },
            this.config.key);
        const documentUrl = `${this.config.orderer}/${this.config.tenantId}/${containerId}`;
        return Promise.resolve({
            endpoints: {
                deltaStorageUrl: `${this.config.orderer}/deltas/${this.config.tenantId}/${containerId}`,
                ordererUrl: `${this.config.orderer}`,
                storageUrl: `${this.config.storage}/repos/${this.config.tenantId}`,
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

export class RouterliciousService implements IGetContainerService {
    public readonly documentServiceFactory: IDocumentServiceFactory;
    public readonly urlResolver: IUrlResolver;

    constructor(config: IRouterliciousConfig) {
        const user = {
            id: "unique-id",
            name: "Unique Idee",
        };
        const tokenProvider = new InsecureTokenProvider(config.key, user);
        this.urlResolver = new SimpleUrlResolver(config, user);
        this.documentServiceFactory = new RouterliciousDocumentServiceFactory(tokenProvider, this.urlResolver);
    }
}
