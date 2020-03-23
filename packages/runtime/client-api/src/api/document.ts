/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import * as cell from "@microsoft/fluid-cell";
import { ComponentRuntime } from "@microsoft/fluid-component-runtime";
import {
    IDeltaManager,
    IFluidCodeDetails,
    IGenericBlob,
    IProxyLoaderFactory,
} from "@microsoft/fluid-container-definitions";
import { Container, Loader } from "@microsoft/fluid-container-loader";
import { IContainerRuntimeOptions } from "@microsoft/fluid-container-runtime";
import { Deferred } from "@microsoft/fluid-common-utils";
import { IDocumentServiceFactory, IUrlResolver } from "@microsoft/fluid-driver-definitions";
import * as ink from "@microsoft/fluid-ink";
import { ISharedDirectory, ISharedMap, SharedDirectory, SharedMap } from "@microsoft/fluid-map";
import {
    IDocumentMessage,
    ISequencedClient,
    ISequencedDocumentMessage,
} from "@microsoft/fluid-protocol-definitions";
import { IComponentContext } from "@microsoft/fluid-runtime-definitions";
import * as sequence from "@microsoft/fluid-sequence";
import { ISharedObject } from "@microsoft/fluid-shared-object-base";
import { CodeLoader } from "./codeLoader";
import { debug } from "./debug";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const apiVersion = require("../../package.json").version;

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

    public get options(): any {
        return this.runtime.options;
    }

    /**
     * Returns the parent branch for this document
     */
    public get parentBranch(): string {
        return this.runtime.parentBranch;
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
        public readonly runtime: ComponentRuntime,
        public readonly context: IComponentContext,
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
     * Called to snapshot the given document
     */
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public snapshot(tagMessage: string = ""): Promise<void> {
        return this.runtime.snapshot(tagMessage);
    }

    // eslint-disable-next-line no-null/no-null
    public save(tag: string = null) {
        this.runtime.save(tag);
    }

    /**
     * Closes the document and detaches all listeners
     */
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public close() {
        if (this.closeFn === undefined) {
            throw new Error("closeFn handler was not provided to Document");
        }
        return this.closeFn();
    }

    public async uploadBlob(file: IGenericBlob): Promise<IGenericBlob> {
        return this.runtime.uploadBlob(file);
    }

    public async getBlob(blobId: string): Promise<IGenericBlob> {
        return this.runtime.getBlob(blobId);
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public getBlobMetadata(): Promise<IGenericBlob[]> {
        return this.runtime.getBlobMetadata();
    }
}

async function initializeChaincode(container: Container, pkg: IFluidCodeDetails): Promise<void> {
    const quorum = container.getQuorum();

    // Wait for connection so that proposals can be sent
    if (!container.connected) {
        await new Promise<void>((resolve) => container.on("connected", () => resolve()));
    }

    // And then make the proposal if a code proposal has not yet been made
    if (!quorum.has("code") && !quorum.has("code2")) {
        await quorum.propose("code", pkg);
    }

    let code = quorum.get("code");

    // Back compat
    if (!code) {
        code = quorum.get("code2");
    }

    debug(`Code is ${code}`);
}

function attach(loader: Loader, url: string, deferred: Deferred<Document>): void {
    const responseP = loader.request({ url });

    responseP.then(
        (response) => {
            if (response.status !== 200 || response.mimeType !== "fluid/component") {
                return;
            }

            // Check if the component is viewable
            deferred.resolve(response.value);
        },
        (error) => {
            debug(`Request failure: ${url}}]`);
        });
}

async function requestDocument(loader: Loader, container: Container, uri: string) {
    const deferred = new Deferred<Document>();

    const errorHandler = (e) => deferred.reject(e);
    container.on("error", errorHandler);
    attach(loader, uri, deferred);
    container.on("contextChanged", (value) => {
        attach(loader, uri, deferred);
    });

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    deferred.promise.finally(() => container.removeListener("error", errorHandler));
    return deferred.promise;
}

/**
 * Loads a specific version (commit) of the shared object
 */
export async function load(
    url: string,
    resolver: IUrlResolver,
    options: any = {},
    serviceFactory: IDocumentServiceFactory = defaultDocumentServiceFactory,
    runtimeOptions: IContainerRuntimeOptions = { generateSummaries: false },
): Promise<Document> {
    const codeLoader = new CodeLoader(runtimeOptions);

    // Load the Fluid document
    // For legacy purposes we currently fill in a default domain
    const loader = new Loader(
        resolver,
        serviceFactory,
        codeLoader,
        options,
        {},
        new Map<string, IProxyLoaderFactory>(),
    );
    const container = await loader.resolve({ url });

    // The client-api CodeLoader doesn't actually read the proposed code details, so this doesn't really matter.
    const codeDetails: IFluidCodeDetails = {
        package: `@fluid-internal/client-api@${apiVersion}`,
        config: {},
    };

    if (!container.existing) {
        await initializeChaincode(container, codeDetails);
    }

    return requestDocument(loader, container, url);
}
