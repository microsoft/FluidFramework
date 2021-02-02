/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-extraneous-dependencies */
export * from "old-container-definitions";
export * from "old-core-interfaces";
export { IDocumentServiceFactory, IUrlResolver } from "old-driver-definitions";
export { LocalResolver } from "old-local-driver";
export { IFluidDataStoreFactory } from "old-runtime-definitions";
export { OpProcessingController } from "old-test-utils";

import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "old-aqueduct";
import { SharedCell } from "old-cell";
import { IContainer, IRuntimeFactory } from "old-container-definitions";
import { Loader } from "old-container-loader";
import { IContainerRuntimeOptions } from "old-container-runtime";
import { IFluidCodeDetails } from "old-core-interfaces";
import { SharedCounter } from "old-counter";
import { IChannelFactory } from "old-datastore-definitions";
import { IDocumentServiceFactory } from "old-driver-definitions";
import { Ink } from "old-ink";
import { LocalDocumentServiceFactory, LocalResolver } from "old-local-driver";
import { SharedDirectory, SharedMap } from "old-map";
import { SharedMatrix } from "old-matrix";
import { ConsensusQueue } from "old-ordered-collection";
import { ConsensusRegisterCollection } from "old-register-collection";
import { IFluidDataStoreFactory } from "old-runtime-definitions";
import { SharedString, SparseMatrix } from "old-sequence";
import {
    ChannelFactoryRegistry,
    createAndAttachContainer,
    createLocalLoader,
    fluidEntryPoint,
    LocalCodeLoader,
    OpProcessingController,
    TestContainerRuntimeFactory,
    TestFluidObjectFactory,
} from "old-test-utils";

import {v4 as uuid} from "uuid";
import {
    createRuntimeFactory,
    DataObjectFactoryType,
    getDataStoreFactory,
    ITestObjectProvider,
    ITestContainerConfig,
    V1,
    V2,
} from "./compatUtils";
import * as newVer from "./newVersion";
/* eslint-enable import/no-extraneous-dependencies */

const defaultCodeDetails: IFluidCodeDetails = {
    package: "defaultTestPackage",
    config: {},
};

// This is a replica of the code in localLoader.ts in test-utils, but bind to the old version.
// TODO: once 0.27 is the back-compat version that we test, we can just use the version in the old-test-utils
// However, if there are any changes to these class and code, we can shim it here.

/**
 * A convenience class to manage a set of local test object to create loaders/containers with configurable way
 * to create a runtime factory from channels and factories to allow different version of the runtime to be created.
 * The objects includes the LocalDeltaConnectionServer, DocumentServiceFactory, UrlResolver.
 *
 * When creating and loading containers, it uses a default document id and code detail.
 *
 * Since the channel is just a pass thru to the call back, the type is parameterized to allow use channel
 * from different version. The only types that required to compatible when using different versions are:
 *   fluidEntryPoint
 *   IClientConfiguration
 *   ILocalDeltaConnectionServer
 */
export class LocalTestObjectProvider<TestContainerConfigType> {
    private _documentServiceFactory: IDocumentServiceFactory | undefined;
    private _defaultUrlResolver: LocalResolver | undefined;
    private _opProcessingController: OpProcessingController | undefined;
    private _documentId?: string;

    /**
     * Create a set of object to
     * @param createFluidEntryPoint - callback to create a fluidEntryPoint, with an optiona; set of channel name
     * and factory for TestFluidObject
     * @param serviceConfiguration - optional serviceConfiguration to create the LocalDeltaConnectionServer with
     * @param _deltaConnectionServer - optional deltaConnectionServer to share documents between different provider
     */
    constructor(
        private readonly createFluidEntryPoint: (testContainerConfig?: TestContainerConfigType) => fluidEntryPoint,
        private readonly serviceConfiguration?: Partial<newVer.IClientConfiguration>,
        private _deltaConnectionServer?: newVer.ILocalDeltaConnectionServer | undefined,
    ) {

    }

    readonly driver: newVer.ITestDriver ={
        type: "local",
        version: "0.34.0",
        createContainerUrl: (testId)=>`http://localhost${testId}`,
        createCreateNewRequest: (testId)=>this.urlResolver.createCreateNewRequest(testId),
        createDocumentServiceFactory: ()=>this.documentServiceFactory as any as newVer.IDocumentServiceFactory,
        createUrlResolver: ()=>this.urlResolver,
    };

    get documentId(): string {
        if(this._documentId === undefined) {
            this._documentId = uuid();
        }
        return this._documentId;
    }

    get defaultCodeDetails() {
        return defaultCodeDetails;
    }

    get deltaConnectionServer() {
        if (!this._deltaConnectionServer) {
            this._deltaConnectionServer = newVer.LocalDeltaConnectionServer.create(
                undefined,
                this.serviceConfiguration,
            );
        }
        return this._deltaConnectionServer;
    }

    get documentServiceFactory() {
        if (!this._documentServiceFactory) {
            this._documentServiceFactory = new LocalDocumentServiceFactory(this.deltaConnectionServer as any);
        }
        return this._documentServiceFactory;
    }

    get urlResolver() {
        if (!this._defaultUrlResolver) {
            this._defaultUrlResolver = new LocalResolver();
        }
        return this._defaultUrlResolver;
    }

    get opProcessingController() {
        if (!this._opProcessingController) {
            this._opProcessingController = new OpProcessingController(this.deltaConnectionServer as any);
        }
        return this._opProcessingController;
    }

    private createLoader(packageEntries: Iterable<[IFluidCodeDetails, fluidEntryPoint]>) {
        const codeLoader = new LocalCodeLoader(packageEntries);
        return new Loader({
            urlResolver: this.urlResolver,
            documentServiceFactory: this.documentServiceFactory,
            codeLoader,
        });
    }

    /**
     * Make a test loader
     * @param testContainerConfig - optional configuring the test Container
     */
    public makeTestLoader(testContainerConfig?: TestContainerConfigType) {
        return this.createLoader([[defaultCodeDetails, this.createFluidEntryPoint(testContainerConfig)]]);
    }

    /**
     * Make a container using a default document id and code details
     * @param testContainerConfig - optional configuring the test Container
     */
    public async makeTestContainer(testContainerConfig?: TestContainerConfigType) {
        const loader = this.makeTestLoader(testContainerConfig);
        const container = await createAndAttachContainer(
            defaultCodeDetails,
            loader,
            this.urlResolver.createCreateNewRequest(this.documentId),
        );

        // TODO: the old version delta manager on the container doesn't do pause/resume count
        // We can't use it to do pause/resume, or it will conflict with the call from the runtime's
        // DeltaManagerProxy. Reach in to get in until > 0.28
        const deltaManagerProxy = (container as any)._context.deltaManager;
        this.opProcessingController.addDeltaManagers(deltaManagerProxy);
        return container;
    }

    /**
     * Load a container using a default document id and code details
     * @param testContainerConfig - optional configuring the test Container
     */
    public async loadTestContainer(testContainerConfig?: TestContainerConfigType) {
        const loader = this.makeTestLoader(testContainerConfig);
        const container = await loader.resolve({ url: `http://localhost/${this.documentId}` });

        // TODO: the old version delta manager on the container doesn't do pause/resume count
        // We can't use it to do pause/resume, or it will conflict with the call from the runtime's
        // DeltaManagerProxy. Reach in to get in until > 0.28
        const deltaManagerProxy = (container as any)._context.deltaManager;
        this.opProcessingController.addDeltaManagers(deltaManagerProxy);
        return container;
    }

    /**
     * Close out the DeltaConnectionServer and clear all the document and reset to original state.
     * The object can continue to be used afterwards
     */
    public async reset() {
        await this._deltaConnectionServer?.webSocketServer.close();
        this._deltaConnectionServer = undefined;
        this._documentServiceFactory = undefined;
        this._opProcessingController = undefined;
        this._documentId = undefined;
    }
}

// A simple old-version dataStore with runtime/root exposed for testing
// purposes. Used to test compatibility of context reload between
// different runtime versions.
export class OldTestDataObject extends DataObject {
    public static readonly type = "@fluid-example/test-dataStore";
    public get _context() { return this.context; }
    public get _runtime() { return this.runtime; }
    public get _root() { return this.root; }
}

export class OldTestDataObjectV1 extends OldTestDataObject {
    public static readonly version = V1;
    public readonly version = V1;
}

export class OldTestDataObjectV2 extends OldTestDataObject {
    public static readonly version = V2;
    public readonly version = V2;
    public static readonly testKey = "version2";
    protected async hasInitialized() {
        this.root.set(OldTestDataObjectV2.testKey, true);
    }
}

const registryMapping = {
    [newVer.SharedMap.getFactory().type]                    : SharedMap.getFactory(),
    [newVer.SharedString.getFactory().type]                 : SharedString.getFactory(),
    [newVer.SharedDirectory.getFactory().type]              : SharedDirectory.getFactory(),
    [newVer.ConsensusRegisterCollection.getFactory().type]  : ConsensusRegisterCollection.getFactory(),
    [newVer.SharedCell.getFactory().type]                   : SharedCell.getFactory(),
    [newVer.Ink.getFactory().type]                          : Ink.getFactory(),
    [newVer.SharedMatrix.getFactory().type]                 : SharedMatrix.getFactory(),
    [newVer.ConsensusQueue.getFactory().type]               : ConsensusQueue.getFactory(),
    [newVer.SparseMatrix.getFactory().type]                 : SparseMatrix.getFactory(),
    [newVer.SharedCounter.getFactory().type]                : SharedCounter.getFactory(),
};

// convert a channel factory registry for TestFluidDataStoreFactory to one with old channel factories
function convertRegistry(registry: newVer.ChannelFactoryRegistry = []): ChannelFactoryRegistry {
    const oldRegistry: [string | undefined, IChannelFactory][] = [];
    for (const [key, factory] of registry) {
        const oldFactory = registryMapping[factory.type];
        if (oldFactory === undefined) {
            throw Error(`Invalid or unimplemented channel factory: ${factory.type}`);
        }
        oldRegistry.push([key, oldFactory]);
    }

    return oldRegistry;
}

const createOldPrimedDataStoreFactory = (
    registry?: newVer.ChannelFactoryRegistry,
): IFluidDataStoreFactory => {
    return new DataObjectFactory(
        OldTestDataObject.type,
        OldTestDataObject,
        [...convertRegistry(registry)].map((r) => r[1]),
        {});
};

const createOldTestFluidDataStoreFactory = (
    registry?: newVer.ChannelFactoryRegistry,
): IFluidDataStoreFactory => {
    return new TestFluidObjectFactory(convertRegistry(registry));
};

function getOldDataStoreFactory(containerOptions?: ITestContainerConfig) {
    switch (containerOptions?.fluidDataObjectType) {
        case undefined:
        case DataObjectFactoryType.Primed:
            return createOldPrimedDataStoreFactory(containerOptions?.registry);
        case DataObjectFactoryType.Test:
            return createOldTestFluidDataStoreFactory(containerOptions?.registry);
        default:
            throw new Error("unknown data store factory type");
    }
}

const createOldTestRuntimeFactory = (
    type: string,
    dataStoreFactory: newVer.IFluidDataStoreFactory | IFluidDataStoreFactory,
    runtimeOptions: IContainerRuntimeOptions = { initialSummarizerDelayMs: 0 },
): IRuntimeFactory => {
    return new TestContainerRuntimeFactory(type, dataStoreFactory as IFluidDataStoreFactory, runtimeOptions);
};

export function createOldRuntimeFactory(dataStore): IRuntimeFactory {
    const type = OldTestDataObject.type;
    const factory = new DataObjectFactory(type, dataStore, [], {});
    return new ContainerRuntimeFactoryWithDefaultDataStore(
        factory,
        [[type, Promise.resolve(new DataObjectFactory(type, dataStore, [], {}))]],
    );
}

export async function createOldContainer(
    documentId,
    packageEntries,
    server,
    urlResolver,
    codeDetails,
): Promise<IContainer> {
    const loader = createLocalLoader(packageEntries, server, urlResolver, { hotSwapContext: true });
    return createAndAttachContainer(codeDetails, loader, urlResolver.createCreateNewRequest(documentId));
}

export function createTestObjectProvider(
    oldLoader: boolean,
    oldContainerRuntime: boolean,
    oldDataStoreRuntime: boolean,
    type: string,
    serviceConfiguration?: Partial<newVer.IClientConfiguration>,
    driver?: newVer.ITestDriver,
): ITestObjectProvider {
    const containerFactoryFn = (containerOptions?: ITestContainerConfig) => {
        const dataStoreFactory = oldDataStoreRuntime
            ? getOldDataStoreFactory(containerOptions)
            : getDataStoreFactory(containerOptions);

        return oldContainerRuntime
            ? createOldTestRuntimeFactory(type, dataStoreFactory, containerOptions?.runtimeOptions)
            : createRuntimeFactory(type, dataStoreFactory, containerOptions?.runtimeOptions);
    };

    // back-compat: 0.33 begins using TestObjectProvider instead of LocalTestObjectProvider
    // Once this file references 0.33, oldLoader should create a TestObjectProvider instead
    if (oldLoader) {
        return new LocalTestObjectProvider(
            containerFactoryFn as () => IRuntimeFactory, serviceConfiguration);
    } else {
        if (driver === undefined) {
            throw new Error("Must provide a driver when using the current loader");
        }
        return new newVer.TestObjectProvider(
            driver, containerFactoryFn as () => newVer.IRuntimeFactory);
    }
}
