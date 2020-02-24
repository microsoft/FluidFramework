/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IResolvedUrl, IUrlResolver, IFluidResolvedUrl, OpenMode } from "@microsoft/fluid-driver-definitions";
import { InnerDocumentServiceFactory } from ".";

/**
 * A UrlResolver that returns a fixed url
 */
export class InnerUrlResolver implements IUrlResolver {
    public static resolvedUrl: IFluidResolvedUrl = {
        type: "fluid",
        endpoints: {},
        tokens: {},
        url: `${InnerDocumentServiceFactory.protocolName}//nowhere.fluid/tenantid/documentid`,
        openMode: OpenMode.OpenExisting,
    };


    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        return Promise.resolve(InnerUrlResolver.resolvedUrl);
    }
}
