/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { parse } from "url";
import {
    IComponentRunnable,
    IRequest,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import { IContainer, ILoader } from "@microsoft/fluid-container-definitions";
import { Container, Loader } from "@microsoft/fluid-container-loader";
import { BaseTelemetryNullLogger } from "@microsoft/fluid-common-utils";
import {
    IDocumentService,
    IDocumentServiceFactory,
    IFluidResolvedUrl,
} from "@microsoft/fluid-driver-definitions";
import { OdspDocumentServiceFactory } from "@microsoft/fluid-odsp-driver";
import { ISequencedDocumentMessage } from "@microsoft/fluid-protocol-definitions";
import { DefaultErrorTracking, RouterliciousDocumentServiceFactory } from "@microsoft/fluid-routerlicious-driver";
import { WebCodeLoader } from "@microsoft/fluid-web-code-loader";
import * as Comlink from "comlink";

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
                "", // figure this out
                async (siteUrl: string) => Promise.resolve(this.resolved.tokens.storageToken),
                async () => Promise.resolve(this.resolved.tokens.socketToken),
                new BaseTelemetryNullLogger());
        }
        const documentService: IDocumentService = await factory.createDocumentService(this.resolved);
        this.container = await Container.load(
            this.id,
            documentService,
            new WebCodeLoader(),
            this.options,
            {},
            (this as unknown) as Loader,
            request,
            this.resolved,
            new BaseTelemetryNullLogger());

        if (this.container.deltaManager.referenceSequenceNumber <= this.fromSequenceNumber) {
            await new Promise((resolve, reject) => {
                const opHandler = (message: ISequencedDocumentMessage) => {
                    if (message.sequenceNumber > this.fromSequenceNumber) {
                        resolve();
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        this.container!.removeListener("op", opHandler);
                    }
                };
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                this.container!.on("op", opHandler);
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
}

Comlink.expose(WorkerLoader);
