/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IRequest,
} from "@prague/component-core-interfaces";
import {
    IResolvedUrl,
    IUrlResolver,
} from "@prague/protocol-definitions";

/**
 * A UrlResolver that just returns what's given.
 * A convenience for when we're using iframes
 */
export class InnerUrlResolver implements IUrlResolver {
    constructor(private readonly resolved: IResolvedUrl) {
    }

    public resolve(request: IRequest): Promise<IResolvedUrl> {
        return Promise.resolve(this.resolved);
    }
}
