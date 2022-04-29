/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Comlink from "comlink";
import { IRequest } from "@fluidframework/core-interfaces";
import { IFrameInnerApi } from "./inframehost";

export class ContainerProxy {
    public static async create(
        innerApi: Comlink.Remote<IFrameInnerApi>,
        documentId: string,
        createNew: boolean,
    ): Promise<ContainerProxy> {
        const containerId = await innerApi.loadContainer(documentId, createNew);
        return new ContainerProxy(innerApi, containerId);
    }

    private constructor(
        private readonly innerApi: Comlink.Remote<IFrameInnerApi>,
        private readonly containerId: string,
    ) { }

    public async attach(request: IRequest): Promise<void> {
        return this.innerApi.attachContainer(this.containerId, request);
    }
}
