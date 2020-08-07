/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/core-interfaces";
import { IResolvedUrl, IUrlResolver } from "@fluidframework/driver-definitions";

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
        if (resolved !== undefined) {
            return resolved;
        }
    }
    return undefined;
}

export class MultiUrlResolver implements IUrlResolver {
    public static create(urlResolver: IUrlResolver | IUrlResolver[]) {
        if (Array.isArray(urlResolver)) {
            if (urlResolver.length === 1) {
                return urlResolver[0];
            }
            return new MultiUrlResolver(urlResolver);
        }
        return urlResolver;
    }

    private constructor(private readonly urlResolvers: IUrlResolver[]) { }

    async resolve(request: IRequest): Promise<IResolvedUrl | undefined> {
        return configurableUrlResolver(this.urlResolvers, request);
    }

    public async getAbsoluteUrl(
        resolvedUrl: IResolvedUrl,
        relativeUrl: string,
    ): Promise<string> {
        throw new Error("Not implmented");
    }
}
