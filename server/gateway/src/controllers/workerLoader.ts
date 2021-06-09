/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidCodeDetails,
    IFluidRunnable,
    IRequest,
    IResponse,
} from "@fluidframework/core-interfaces";
import { IContainer, ILoader } from "@fluidframework/container-definitions";
import { Container, Loader } from "@fluidframework/container-loader";
import { IFluidResolvedUrl } from "@fluidframework/driver-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import * as Comlink from "comlink";

// Loader class to load a container and proxy Fluid object interfaces from within a web worker.
// Only supports IFluidRunnable for now.

// TODO: Need to update this class with latest loader changes.
class WorkerLoader implements ILoader, IFluidRunnable {
    public get IFluidRouter() { return this; }
    private container: Container | undefined;
    private runnable: IFluidRunnable | undefined;

    constructor(
        private readonly id: string,
        private readonly resolved: IFluidResolvedUrl,
        private readonly fromSequenceNumber: number) {
    }

    public async request(request: IRequest): Promise<IResponse> {
        console.log(`Request inside web worker`);
        console.log(request);
        const container = await Container.load(
            this.id,
            (this as unknown) as Loader,
            request,
            this.resolved,
            // To be used when taking the updated Container.load signature
            // {
            //     canReconnect: request.headers?.[LoaderHeader.reconnect],
            //     clientDetailsOverride: request.headers?.[LoaderHeader.clientDetails],
            //     containerUrl: request.url,
            //     docId: decodeURI(this.id),
            //     resolvedUrl: this.resolved,
            //     version: request.headers?.[LoaderHeader.version],
            //     loadMode: request.headers?.[LoaderHeader.loadMode],
            // },
        );
        this.container = container;

        // TODO: referenceSequenceNumber -> lastSequenceNumber (when latest loader is picked up)
        if (this.container.deltaManager.lastSequenceNumber <= this.fromSequenceNumber) {
            await new Promise<void>((resolve, reject) => {
                const opHandler = (message: ISequencedDocumentMessage) => {
                    if (message.sequenceNumber > this.fromSequenceNumber) {
                        resolve();
                        container.removeListener("op", opHandler);
                    }
                };
                container.on("op", opHandler);
            });
        }

        const response = await this.container.request(request);
        if (response.status !== 200 || response.mimeType !== "fluid/object") {
            return { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
        }
        this.runnable = response.value as IFluidRunnable;
        if (this.runnable === undefined) {
            return { status: 404, mimeType: "text/plain", value: `IFluidRunnable not found` };
        }
        return { status: 200, mimeType: "fluid/object", value: `loaded` };
    }

    public async resolve(request: IRequest): Promise<IContainer> {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.container!;
    }

    public async run(...args: any[]): Promise<void> {
        return this.runnable === undefined ? Promise.reject(new Error("Not runnable")) : this.runnable.run(...args);
    }

    public async stop(reason?: string): Promise<void> {
        if (this.runnable !== undefined && this.runnable.stop !== undefined) {
            return this.runnable.stop(reason);
        }
    }

    public async createDetachedContainer(source: IFluidCodeDetails): Promise<IContainer> {
        throw new Error("Method not implemented.");
    }

    public async rehydrateDetachedContainerFromSnapshot(snapshot: string): Promise<IContainer> {
        throw new Error("Method not implemented.");
    }
}

Comlink.expose(WorkerLoader);
