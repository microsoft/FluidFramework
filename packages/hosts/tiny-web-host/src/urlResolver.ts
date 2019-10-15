/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable: no-unsafe-any
import { IResolvedUrl, IUrlResolver } from "@microsoft/fluid-protocol-definitions";
import { ConfigurableUrlResolver } from "@microsoft/fluid-routerlicious-host";

export async function resolveFluidUrl(url: string, resolversList: IUrlResolver[]): Promise<IResolvedUrl> {
    const resolver = new ConfigurableUrlResolver(resolversList);
    const resolved: IResolvedUrl = await resolver.resolve({ url });
    return resolved;
}
