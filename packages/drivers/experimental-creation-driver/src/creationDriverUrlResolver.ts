/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/component-core-interfaces";
import { IFluidResolvedUrl, IResolvedUrl, IUrlResolver } from "@fluidframework/driver-definitions";

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

    public async getAbsoluteUrl(
        resolvedUrl: IResolvedUrl,
        relativeUrl: string,
    ): Promise<string> {
        throw new Error("Not implmented");
    }
}
