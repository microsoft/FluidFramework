/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest, IResponse } from "@microsoft/fluid-component-core-interfaces";
import { IResolvedUrl, IUrlResolver } from "@microsoft/fluid-driver-definitions";

/**
 * A UrlResolver that returns a fixed url
 */
export class InnerUrlResolver implements IUrlResolver {
    constructor(private readonly resolved: IResolvedUrl) {
    }

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        return Promise.resolve(this.resolved);
    }

    public async requestUrl(
        resolvedUrl: IResolvedUrl,
        request: IRequest,
    ): Promise<IResponse> {
        throw new Error("Not implmented");
    }
}
