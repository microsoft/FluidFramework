/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IResolvedUrl, IUrlResolver } from "@microsoft/fluid-driver-definitions";
import { configurableUrlResolver } from "@microsoft/fluid-driver-utils";
import { IRequest } from "@microsoft/fluid-component-core-interfaces";

export async function resolveFluidUrl(request: IRequest, resolversList: IUrlResolver[]): Promise<IResolvedUrl> {
    const resolved: IResolvedUrl = await configurableUrlResolver(resolversList, request);
    return resolved;
}
