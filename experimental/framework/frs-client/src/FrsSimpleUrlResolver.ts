/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/core-interfaces";
import { IUrlResolver, IFluidResolvedUrl, IResolvedUrl } from "@fluidframework/driver-definitions";
import { ITokenProvider } from "@fluidframework/routerlicious-driver";
import { FrsConnectionConfig } from "./interfaces";

export class FrsSimpleUrlResolver implements IUrlResolver {
    constructor(
        private readonly config: FrsConnectionConfig,
        private readonly documentId: string,
        private readonly tokenProvider: ITokenProvider,
    ) { }

    public async resolve(request: IRequest): Promise<IFluidResolvedUrl> {
        const containerId = request.url.split("/")[0];
        const token = (await this.tokenProvider.fetchOrdererToken(this.config.tenantId, this.documentId)).jwt;
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
