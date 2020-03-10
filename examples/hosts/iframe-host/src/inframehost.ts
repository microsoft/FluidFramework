/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFrameDocumentServiceProxyFactory,
} from "@microsoft/fluid-iframe-driver";
import { Loader, Container } from "@microsoft/fluid-container-loader";
import {
    IProxyLoaderFactory,
    ICodeLoader ,
    IContainerContext,
    IRuntime,
    IRuntimeFactory,
    IRuntimeState,
} from "@microsoft/fluid-container-definitions";
import { IRequest, IResponse } from "@microsoft/fluid-component-core-interfaces";

import { IBaseHostConfig } from "@microsoft/fluid-base-host";
import { ISequencedDocumentMessage, ITree, ConnectionState } from "@microsoft/fluid-protocol-definitions";

class ProxyRuntime implements IRuntime{
    private _disposed = false;
    public get disposed() { return this._disposed; }

    public dispose(): void {
        this._disposed = true;
    }

    async request(request: IRequest): Promise<IResponse> {
        throw new Error("Method not implemented.");
    }
    async snapshot(tagMessage: string, fullTree?: boolean | undefined): Promise<ITree | null> {
        throw new Error("Method not implemented.");
    }
    async changeConnectionState(value: ConnectionState, clientId: string, version?: string | undefined) {
    }
    async stop(): Promise<IRuntimeState> {
        throw new Error("Method not implemented.");
    }
    async process(message: ISequencedDocumentMessage, local: boolean, context: any) {
    }
    async processSignal(message: any, local: boolean) {
    }
}

class ProxyChaincode implements IRuntimeFactory{

    async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        return new ProxyRuntime();
    }

    get IRuntimeFactory(){
        return this;
    }
}

class ProxyCodeLoader implements ICodeLoader{

    async load(){
        return Promise.resolve({ fluidExport: new ProxyChaincode() });
    }
}

export class IFrameOuterHost {
    private readonly loader: Loader;
    constructor(private readonly hostConfig: IBaseHostConfig){
        // todo
        // disable summaries
        // set as non-user client
        this.loader = new Loader(
            hostConfig.urlResolver,
            hostConfig.documentServiceFactory,
            new ProxyCodeLoader(),
            hostConfig.config ?? {},
            hostConfig.scope ?? {},
            hostConfig.proxyLoaderFactories ?? new Map<string, IProxyLoaderFactory>(),
        );
    }

    public async load(request: IRequest, iframe: HTMLIFrameElement): Promise<Container>{

        const proxy = await IFrameDocumentServiceProxyFactory.create(
            this.hostConfig.documentServiceFactory,
            iframe,
            this.hostConfig.config,
            this.hostConfig.urlResolver);

        await proxy.createDocumentServiceFromRequest(request);

        // don't try to connect until the iframe does, so they get existing false

        await new Promise((resolve)=>setTimeout(() => resolve(), 200));

        const container = await this.loader.resolve(request);
        if(!container.getQuorum().has("code")){
            // we'll never propose the code, so wait for them to do it
            await new Promise((resolve) => container.once("contextChanged", () => resolve()));
        }

        return container;
    }
}
