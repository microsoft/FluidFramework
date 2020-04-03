/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PromiseRegistry } from "@microsoft/fluid-common-utils";
import {
    IRequest,
} from "@microsoft/fluid-component-core-interfaces";
import {
    IResolvedUrl,
    IUrlResolver,
} from "@microsoft/fluid-driver-definitions";
import Axios from "axios";

export class ContainerUrlResolver implements IUrlResolver {
    private readonly registry = new PromiseRegistry<IResolvedUrl>();

    constructor(
        private readonly baseUrl: string,
        private readonly jwt: string,
        cache?: Map<string, IResolvedUrl>,
    ) {
        if (cache !== undefined) {
            for (const [key, value] of cache) {
                this.registry.registerValue(key, value);
            }
        }
    }

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        const headers = {
            Authorization: `Bearer ${this.jwt}`,
        };
        return this.registry.register(
            request.url,
            async () => {
                const response = await Axios.post<IResolvedUrl>(
                    `${this.baseUrl}/api/v1/load`,
                    { url: request.url },
                    { headers });
                return response.data;
            },
        );
    }
}
