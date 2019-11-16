/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable: no-unsafe-any
import { IResolvedUrl, IUrlResolver } from "@microsoft/fluid-container-definitions";
import { configurableUrlResolver } from "@microsoft/fluid-core-utils";

export async function resolveFluidUrl(url: string, resolversList: IUrlResolver[]): Promise<IResolvedUrl> {
    const resolved: IResolvedUrl = await configurableUrlResolver(resolversList, { url });
    return resolved;
}
