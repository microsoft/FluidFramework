/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IResolvedUrl, IUrlResolver } from "@microsoft/fluid-container-definitions";

/**
 * Resolver that takes a list of url resolvers and then try each of them to resolve the url.
 * @param resolversList - List of url resolvers to be used to resolve the request.
 * @param request - Request to be resolved.
 */
export async function configurableUrlResolver(
    resolversList: IUrlResolver[],
    request: IRequest,
): Promise<IResolvedUrl | undefined> {
    const url = request.url;
    let resolved: IResolvedUrl | undefined;
    for (const resolver of resolversList) {
        resolved = await resolver.resolve({ url });
        if (resolved) {
            return resolved;
        }
    }
    return undefined;
}
