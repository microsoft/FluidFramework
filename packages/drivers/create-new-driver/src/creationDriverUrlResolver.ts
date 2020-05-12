/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest, IResponse } from "@microsoft/fluid-component-core-interfaces";
import { IFluidResolvedUrl, IResolvedUrl, IUrlResolver } from "@microsoft/fluid-driver-definitions";

export class CreationDriverUrlResolver implements IUrlResolver {
    constructor() { }

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        const [, queryString] = request.url.split("?");

        const searchParams = new URLSearchParams(queryString);

        const uniqueId = searchParams.get("uniqueId");
        if (uniqueId === null) {
            throw new Error("URL for creation driver should contain the uniqueId");
        }
        const response: IFluidResolvedUrl = {
            endpoints: { snapshotStorageUrl: "" },
            tokens: {},
            type: "fluid",
            url: `fluid-creation://placeholder/placeholder/${uniqueId}`,
        };

        return response;
    }

    public async requestUrl(
        resolvedUrl: IResolvedUrl,
        request: IRequest,
    ): Promise<IResponse> {
        throw new Error("Not implmented");
    }
}
