/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IResolvedUrl, IUrlResolver, IFluidResolvedUrl, OpenMode } from "@microsoft/fluid-driver-definitions";
import { InnerDocumentServiceFactory } from ".";

/**
 * A UrlResolver that just returns what's given.
 * A convenience for when we're using iframes
 */
export class InnerUrlResolver implements IUrlResolver {
    public static resolvedUrl: IFluidResolvedUrl = {
        type: "fluid",
        endpoints: {},
        tokens: {},
        url: `${InnerDocumentServiceFactory.protocolName}//nowhere.fluid/tenantid/documentid`,
        openMode: OpenMode.OpenExisting,
    };


    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public resolve(request: IRequest): Promise<IResolvedUrl> {
        return Promise.resolve(InnerUrlResolver.resolvedUrl);
    }
}
