/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Comlink from "comlink";
import { IContainer } from "@fluidframework/container-definitions";
import { IRequest } from "@fluidframework/core-interfaces";

export interface IContainerProxy {
    attach(request: IRequest): Promise<void>;
}

export function MakeContainerProxy(container: IContainer): IContainerProxy {
    const proxy: IContainerProxy = {
        attach: Comlink.proxy(async (request) => container.attach(request)),
    };
    return proxy;
}
