/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponentRunnable,
    IRequest,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import { IContainer } from "@microsoft/fluid-container-definitions";
import { Container, Loader } from "@microsoft/fluid-container-loader";
import { BaseTelemetryNullLogger } from "@microsoft/fluid-core-utils";
import { OdspDocumentServiceFactory } from "@microsoft/fluid-odsp-driver";
import {
    IDocumentService,
    IDocumentServiceFactory,
    IFluidResolvedUrl,
    ISequencedDocumentMessage,
} from "@microsoft/fluid-protocol-definitions";
import { DefaultErrorTracking, RouterliciousDocumentServiceFactory } from "@microsoft/fluid-routerlicious-driver";
import { WorkerCodeLoader } from "@microsoft/fluid-web-code-loader";

// tslint:disable no-submodule-imports
import { expose } from "threads/worker";
import { parse } from "url";

let id: string;
let version: string | null | undefined;
let connection: string;
let options: any;
let originalRequest: IRequest;
let resolved: IFluidResolvedUrl;
let container: Container;
let runnerComponent: IComponentRunnable;
let loadFromSequenceNumber: number;

const workerLoader = {
    setup(
        loadId: string,
        loadVersion: string | null | undefined,
        loadConnection: string,
        loadOptions: any,
        loadRequest: IRequest,
        loadResolved: IFluidResolvedUrl,
        fromSequenceNumber: number) {
        id = loadId;
        version = loadVersion;
        connection = loadConnection;
        options = loadOptions;
        originalRequest = loadRequest;
        resolved = loadResolved;
        loadFromSequenceNumber = fromSequenceNumber;
    },

    async load(): Promise<IResponse> {
        const urlObj = parse(resolved.url);
        let factory: IDocumentServiceFactory;
        if (urlObj.protocol === "fluid:") {
            factory = new RouterliciousDocumentServiceFactory(
                false,
                new DefaultErrorTracking(),
                false,
                true,
                null);
        } else {
            factory = new OdspDocumentServiceFactory(
                "", // figure this out
                (siteUrl: string) => Promise.resolve(resolved.tokens.storageToken),
                () => Promise.resolve(resolved.tokens.socketToken),
                new BaseTelemetryNullLogger());
        }
        const documentService: IDocumentService = await factory.createDocumentService(resolved);
        const containerP = Container.load(
            id,
            version,
            documentService,
            new WorkerCodeLoader(),
            options,
            undefined,  // Okay for now.
            connection,
            (this as unknown) as Loader,
            originalRequest,
            false,
            undefined);

        container = await containerP;
        // tslint:disable no-non-null-assertion
        if (container.deltaManager!.referenceSequenceNumber <= loadFromSequenceNumber) {
            await new Promise((resolve, reject) => {
                function opHandler(message: ISequencedDocumentMessage) {
                    if (message.sequenceNumber > loadFromSequenceNumber) {
                        resolve();
                        container.removeListener("op", opHandler);
                    }
                }

                container.on("op", opHandler);
            });
        }

        const response = await container.request(originalRequest);
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            return { status: 404, mimeType: "text/plain", value: `${originalRequest.url} not found` };
        }
        runnerComponent = response.value as IComponentRunnable;
        if (runnerComponent === undefined) {
            return { status: 404, mimeType: "text/plain", value: `IComponentRunnable not found` };
        }
        return { status: 200, mimeType: "fluid/component", value: `loaded` };
    },

    async request(request: IRequest): Promise<IResponse> {
        return container.request(request);
    },

    async resolve(request: IRequest): Promise<IContainer> {
        return container;
    },

    async run(): Promise<void> {
        return runnerComponent === undefined ? Promise.reject() : runnerComponent.run();
    },
};

export type WorkerLoader = typeof workerLoader;
expose(workerLoader);
