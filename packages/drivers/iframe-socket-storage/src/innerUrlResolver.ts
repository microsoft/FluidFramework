/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IResolvedUrl, IUrlResolver } from "@microsoft/fluid-driver-definitions";

/**
 * A UrlResolver that just returns what's given.
 * A convenience for when we're using iframes
 */
export class InnerUrlResolver implements IUrlResolver {
    constructor(private readonly resolved: IResolvedUrl) {
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public resolve(request: IRequest): Promise<IResolvedUrl> {
        return Promise.resolve(this.resolved);
    }
}
