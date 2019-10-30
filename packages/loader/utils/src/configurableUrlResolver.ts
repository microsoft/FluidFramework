/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IResolvedUrl, IUrlResolver } from "@microsoft/fluid-protocol-definitions";
import { any as promiseAny } from "bluebird";

/**
 * Resolver that takes a list of url resolvers and then try each of them to resolve the url.
 * @param resolversList - List of url resolvers to be used to resolve the request.
 * @param request - Request to be resolved.
 */
export async function configurableUrlResolver(
    resolversList: IUrlResolver[],
    request: IRequest,
): Promise<IResolvedUrl> {
    const url = request.url;
    const resolvedUrlPs: Promise<IResolvedUrl>[] = new Array();

    for (const resolver of resolversList) {
        resolvedUrlPs.push(resolver.resolve({ url }));
    }
    return promiseAny(resolvedUrlPs);
}
