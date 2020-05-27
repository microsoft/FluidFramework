/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/component-core-interfaces";
import { IResolvedUrl, IUrlResolver } from "@fluidframework/driver-definitions";

/**
 * A UrlResolver that returns a fixed url
 */
export class InnerUrlResolver implements IUrlResolver {
    constructor(private readonly resolved: IResolvedUrl) {
    }

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        return Promise.resolve(this.resolved);
    }

    // TODO: Issue-2109 Implement detach container api or put appropriate comment.
    public async getAbsoluteUrl(
        resolvedUrl: IResolvedUrl,
        relativeUrl: string,
    ): Promise<string> {
        throw new Error("Not implmented");
    }
}
