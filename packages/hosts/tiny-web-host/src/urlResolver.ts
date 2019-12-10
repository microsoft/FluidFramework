/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IResolvedUrl, IUrlResolver } from "@microsoft/fluid-driver-definitions";
import { configurableUrlResolver } from "@microsoft/fluid-driver-utils";

export async function resolveFluidUrl(url: string, resolversList: IUrlResolver[]): Promise<IResolvedUrl> {
    const resolved: IResolvedUrl = await configurableUrlResolver(resolversList, { url });
    return resolved;
}
