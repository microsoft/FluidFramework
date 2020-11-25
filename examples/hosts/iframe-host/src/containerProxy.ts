/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Comlink from "comlink";
import { IContainer } from "@fluidframework/container-definitions";
import { IRequest, IResponse } from "@fluidframework/core-interfaces";
import { IQuorum } from "@fluidframework/protocol-definitions";

export interface IContainerProxy {
    attach(request: IRequest): Promise<void>;
    request(request: IRequest): Promise<IResponse>;
    getQuorum(): Promise<IQuorum>;
    on(event: string, listener: (...args: any[]) => void): Promise<void>;
    once(event: string, listener: (...args: any[]) => void): Promise<void>;
}

export function MakeContainerProxy(container: IContainer): IContainerProxy {
    const proxy: IContainerProxy = {
        attach: Comlink.proxy(async (request) => container.attach(request)),
        request: Comlink.proxy(async (request) => container.request(request)),
        getQuorum: Comlink.proxy(async () => container.getQuorum()),
        // TODO: figure out proxy events on typed event emitters
        on: Comlink.proxy(async (event: any, listener) => {
            container.on(event, listener);
            return;
        }),
        once: Comlink.proxy(async (event: any, listener) => {
            container.on(event, listener);
            return;
        }),
    };
    return proxy;
}
