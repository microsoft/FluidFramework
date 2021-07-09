/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import * as cell from "@fluidframework/cell";
import { FluidDataStoreRuntime } from "@fluidframework/datastore";
import {
    IDeltaManager, ILoaderOptions,
} from "@fluidframework/container-definitions";
import { Container, Loader } from "@fluidframework/container-loader";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { Deferred } from "@fluidframework/common-utils";
import { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";
import * as ink from "@fluidframework/ink";
import { ISharedDirectory, ISharedMap, SharedDirectory, SharedMap } from "@fluidframework/map";
import {
    IDocumentMessage,
    ISequencedClient,
    ISequencedDocumentMessage,
} from "@fluidframework/protocol-definitions";
import { IFluidDataStoreContext } from "@fluidframework/runtime-definitions";
import * as sequence from "@fluidframework/sequence";
import { ISharedObject } from "@fluidframework/shared-object-base";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { CodeLoader } from "./codeLoader";

// Registered services to use when loading a document
let defaultDocumentServiceFactory: IDocumentServiceFactory;

/**
 * Registers the default services to use for interacting with shared documents. To simplify the API it is
 * expected that the implementation provider of these will register themselves during startup prior to the user
 * requesting to load a shared object.
 */
export function registerDocumentServiceFactory(service: IDocumentServiceFactory) {
    defaultDocumentServiceFactory = service;
}

export const getDefaultDocumentServiceFactory = (): IDocumentServiceFactory => defaultDocumentServiceFactory;

let chaincodeRepo: string;
export function registerChaincodeRepo(repo: string) {
    chaincodeRepo = repo;
}

export const getChaincodeRepo = (): string => chaincodeRepo;
// End temporary calls

/**
 * A document is a collection of shared types.
 */
export class Document extends EventEmitter {
    public get clientId(): string {
        return this.runtime.clientId;
    }

    public get id(): string {
        return this.runtime.documentId;
    }

    public get deltaManager(): IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> {
        return this.runtime.deltaManager;
    }

    /**
     * Flag indicating whether the document already existed at the time of load
     */
    public get existing(): boolean {
        return this.runtime.existing;
    }

    public get options(): ILoaderOptions {
        return this.runtime.options;
    }

    /**
     * Flag indicating whether this document is fully connected.
     */
    public get isConnected(): boolean {
        return this.runtime.connected;
    }

    /**
     * Constructs a new document from the provided details
     */
    constructor(
        public readonly runtime: FluidDataStoreRuntime,
        public readonly context: IFluidDataStoreContext,
        private readonly root: ISharedMap,
        private readonly closeFn: () => void,
    ) {
        super();
    }

    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        this.runtime.on(event, listener);
        return this;
    }

    /**
     * Loads the specified shared object. Returns null if it does not exist
     *
     * This method should not be called directly. Instead access should be obtained through the root map
     * or another shared object.
     *
     * @param id - Identifier of the object to load
     */
    public async get(id: string): Promise<ISharedObject> {
        const channel = await this.runtime.getChannel(id);
        return channel as ISharedObject;
    }

    /**
     * Creates a new shared map
     */
    public createMap(): ISharedMap {
        return SharedMap.create(this.runtime);
    }

    /**
     * Creates a new shared directory
     */
    public createDirectory(): ISharedDirectory {
        return SharedDirectory.create(this.runtime);
    }

    /**
     * Creates a new shared cell.
     */
    public createCell(): cell.ISharedCell {
        return cell.SharedCell.create(this.runtime);
    }

    /**
     * Creates a new shared string
     */
    public createString(): sequence.SharedString {
        return sequence.SharedString.create(this.runtime);
    }

    /**
     * Creates a new ink shared object
     */
    public createInk(): ink.IInk {
        return ink.Ink.create(this.runtime);
    }

    /**
     * Retrieves the root shared object that the document is based on
     */
    public getRoot(): ISharedMap {
        return this.root;
    }

    public getClients(): Map<string, ISequencedClient> {
        const quorum = this.runtime.getQuorum();
        return quorum.getMembers();
    }

    public getClient(clientId: string): ISequencedClient {
        const quorum = this.runtime.getQuorum();
        return quorum.getMember(clientId);
    }

    /**
     * Closes the document and detaches all listeners
     */
    public close() {
        return this.closeFn();
    }

    public async uploadBlob(blob: ArrayBufferLike): Promise<IFluidHandle<ArrayBufferLike>> {
        return this.runtime.uploadBlob(blob);
    }
}

function attach(loader: Loader, url: string, deferred: Deferred<Document>): void {
    const responseP = loader.request({ url });

    void responseP.then(
        (response) => {
            if (response.status !== 200 || response.mimeType !== "fluid/object") {
                return;
            }

            // Check if the Fluid object is viewable
            deferred.resolve(response.value);
        });
}

async function requestDocument(loader: Loader, container: Container, uri: string) {
    const deferred = new Deferred<Document>();

    const errorHandler = (e) => deferred.reject(e);
    container.on("error", errorHandler);
    attach(loader, uri, deferred);
    container.on("contextChanged", () => {
        attach(loader, uri, deferred);
    });

    deferred.promise.finally(() => container.removeListener("error", errorHandler));
    return deferred.promise;
}

/**
 * Loads a specific version (commit) of the shared object
 */
export const load = async (
    url: string,
    urlResolver: IUrlResolver,
    options: ILoaderOptions = {},
    documentServiceFactory: IDocumentServiceFactory = defaultDocumentServiceFactory,
    runtimeOptions: IContainerRuntimeOptions = { summaryOptions: { generateSummaries: false } },
): Promise<Document> => createOrLoad(
        url,
        urlResolver,
        options,
        documentServiceFactory,
        runtimeOptions,
        false, // createNew
    );

export const create = async (
    url: string,
    urlResolver: IUrlResolver,
    options: ILoaderOptions = {},
    documentServiceFactory: IDocumentServiceFactory = defaultDocumentServiceFactory,
    runtimeOptions: IContainerRuntimeOptions = { summaryOptions: { generateSummaries: false } },
): Promise<Document> => createOrLoad(
        url,
        urlResolver,
        options,
        documentServiceFactory,
        runtimeOptions,
        true, // createNew
    );

async function createOrLoad(
    url: string,
    urlResolver: IUrlResolver,
    options: ILoaderOptions,
    documentServiceFactory: IDocumentServiceFactory,
    runtimeOptions: IContainerRuntimeOptions,
    createNew: boolean,
): Promise<Document> {
    const codeLoader = new CodeLoader(runtimeOptions);
    const loader = new Loader({
        urlResolver,
        documentServiceFactory,
        codeLoader,
        options,
    });

    let container: Container;

    if (createNew) {
        container = await loader.createDetachedContainer({
            package: "no-dynamic-package",
            config: {},
        });
        await container.attach({ url });
    } else {
        container = await loader.resolve({ url });
    }

    return requestDocument(loader, container, url);
}
