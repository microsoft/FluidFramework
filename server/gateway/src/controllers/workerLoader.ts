/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { parse } from "url";
import { BaseTelemetryNullLogger } from "@fluidframework/common-utils";
import {
    IComponentRunnable,
    IRequest,
    IResponse,
} from "@fluidframework/component-core-interfaces";
import { IContainer, ILoader, IFluidCodeDetails } from "@fluidframework/container-definitions";
import { Container, Loader } from "@fluidframework/container-loader";
import {
    IDocumentServiceFactory,
    IFluidResolvedUrl,
    IUrlResolver,
    IResolvedUrl,
} from "@fluidframework/driver-definitions";
import { OdspDocumentServiceFactory } from "@fluidframework/odsp-driver";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { DefaultErrorTracking, RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { WebCodeLoader, SemVerCdnCodeResolver } from "@fluidframework/web-code-loader";
import * as Comlink from "comlink";

// Container load requires a URL resolver although it does not make use of it.
class NotUsedUrlResolver implements IUrlResolver {
    public async requestUrl(resolvedUrl: IResolvedUrl, request: IRequest): Promise<IResponse> {
        throw new Error("Method not implemented.");
    }

    public async resolve(request: IRequest): Promise<IResolvedUrl | undefined> {
        throw new Error("Method not implemented.");
    }

    public async getAbsoluteUrl(resolvedUrl: IResolvedUrl, relativeUrl: string): Promise<string> {
        throw new Error("Method not implemented.");
    }
}

// Loader class to load a container and proxy component interfaces from within a web worker.
// Only supports IComponentRunnable for now.
class WorkerLoader implements ILoader, IComponentRunnable {
    private container: Container | undefined;
    private runnable: IComponentRunnable | undefined;

    constructor(
        private readonly id: string,
        private readonly options: any,
        private readonly resolved: IFluidResolvedUrl,
        private readonly fromSequenceNumber: number) {
    }

    public async request(request: IRequest): Promise<IResponse> {
        console.log(`Request inside web worker`);
        console.log(request);
        const urlObj = parse(this.resolved.url);
        let factory: IDocumentServiceFactory;
        if (urlObj.protocol === "fluid:") {
            factory = new RouterliciousDocumentServiceFactory(
                false,
                new DefaultErrorTracking(),
                false,
                true,
                // eslint-disable-next-line no-null/no-null
                null);
        } else {
            factory = new OdspDocumentServiceFactory(
                async (siteUrl: string) => Promise.resolve(this.resolved.tokens.storageToken),
                async () => Promise.resolve(this.resolved.tokens.socketToken));
        }
        const container = await Container.load(
            this.id,
            factory,
            new WebCodeLoader(new SemVerCdnCodeResolver()),
            this.options,
            {},
            (this as unknown) as Loader,
            request,
            this.resolved,
            new NotUsedUrlResolver(),
            new BaseTelemetryNullLogger());
        this.container = container;

        // TODO: referenceSequenceNumber -> lastSequenceNumber (when latest loader is picked up)
        if (this.container.deltaManager.lastSequenceNumber <= this.fromSequenceNumber) {
            await new Promise((resolve, reject) => {
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
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            return { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
        }
        this.runnable = response.value as IComponentRunnable;
        if (this.runnable === undefined) {
            return { status: 404, mimeType: "text/plain", value: `IComponentRunnable not found` };
        }
        return { status: 200, mimeType: "fluid/component", value: `loaded` };
    }

    public async resolve(request: IRequest): Promise<IContainer> {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.container!;
    }

    public async run(...args: any[]): Promise<void> {
        return this.runnable === undefined ? Promise.reject() : this.runnable.run(...args);
    }

    public async stop(reason?: string): Promise<void> {
        if (this.runnable !== undefined && this.runnable.stop !== undefined) {
            return this.runnable.stop(reason);
        }
    }

    public async createDetachedContainer(source: IFluidCodeDetails): Promise<IContainer> {
        throw new Error("Method not implemented.");
    }
}

Comlink.expose(WorkerLoader);
