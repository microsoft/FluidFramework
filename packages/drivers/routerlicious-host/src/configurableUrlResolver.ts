/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IResolvedUrl, IUrlResolver } from "@microsoft/fluid-protocol-definitions";

/**
 * Resolver that takes a list of url resolvers and then try each of them to resolve the url.
 */
export class ConfigurableUrlResolver implements IUrlResolver {

    constructor(private readonly resolversList: IUrlResolver[]) {}

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        const url = request.url;
        let resolved: IResolvedUrl | undefined;
        for (const resolver of this.resolversList) {
            try {
                resolved = await resolver.resolve({ url });
                return resolved;
            } catch {
                continue;
            }
        }
        if (!resolved) {
            throw new Error("No resolver is able to resolve the given url!!");
        }
        return resolved;
    }
}
