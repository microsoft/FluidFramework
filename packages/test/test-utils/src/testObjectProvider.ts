/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IDocumentMessage, ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IContainer, IDeltaManager, IHostLoader } from "@fluidframework/container-definitions";
import { Container, Loader, waitContainerToCatchUp } from "@fluidframework/container-loader";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";
import { ITestDriver } from "@fluidframework/test-driver-definitions";
import { v4 as uuid } from "uuid";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { LoaderContainerTracker } from "./loaderContainerTracker";
import { fluidEntryPoint, LocalCodeLoader } from "./localCodeLoader";
import { createAndAttachContainer } from "./localLoader";
import { ChannelFactoryRegistry } from "./testFluidObject";

const defaultCodeDetails: IFluidCodeDetails = {
    package: "defaultTestPackage",
    config: {},
};

interface IOpProcessingController {
    addDeltaManagers(...deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>[]);
    processIncoming(): Promise<void>;
    processOutgoing(): Promise<void>;
    pauseProcessing(...deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>[]): Promise<void>;
    process(): Promise<void>;
}

class OpProcessingControllerShim implements IOpProcessingController {
    constructor(private readonly tracker: LoaderContainerTracker) {

    }

    addDeltaManagers(...deltaManagers: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>[]) {
        const trackedDeltaManagers =
            Array.from(this.tracker.trackedContainers).map((container) => container.deltaManager);
        for (const deltaManager of deltaManagers) {
            assert(trackedDeltaManagers.includes(deltaManager));
        }
    }

    async processIncoming(): Promise<void> {
        return this.tracker.processIncoming();
    }

    async processOutgoing(): Promise<void> {
        return this.tracker.processOutgoing();
    }
    async pauseProcessing(
        ...deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>[]
    ): Promise<void> {
        const containers =
            Array.from(this.tracker.trackedContainers).filter(
                (container) => deltaManager.includes(container.deltaManager),
            );
        await this.tracker.pauseProcessing(containers);
    }
    async process(): Promise<void> {
        return this.tracker.ensureSynchronized();
    }
}

export interface ITestObjectProvider {
    createContainer(entryPoint: fluidEntryPoint): Promise<IContainer>;

    /**
     * Used to create a test Container. The Loader/ContainerRuntime/DataRuntime might be different versioned.
     * In generateLocalCompatTest(), this Container and its runtime will be arbitrarily-versioned.
     */
    makeTestLoader(testContainerConfig?: ITestContainerConfig): IHostLoader,
    makeTestContainer(testContainerConfig?: ITestContainerConfig): Promise<IContainer>,
    loadTestContainer(testContainerConfig?: ITestContainerConfig): Promise<IContainer>,

    documentServiceFactory: IDocumentServiceFactory,
    urlResolver: IUrlResolver,
    defaultCodeDetails: IFluidCodeDetails,
    opProcessingController: IOpProcessingController,

    ensureSynchronized(): Promise<void>;
    reset(): void,

    documentId: string,
    driver: ITestDriver;

}

export enum DataObjectFactoryType {
    Primed, // default
    Test,
}

export interface ITestContainerConfig {
    // TestFluidDataObject instead of PrimedDataStore
    fluidDataObjectType?: DataObjectFactoryType,

    // And array of channel name and DDS factory pair to create on container creation time
    registry?: ChannelFactoryRegistry,

    // Container runtime options for the container instance
    runtimeOptions?: IContainerRuntimeOptions,
}

export const createDocumentId = (): string => uuid();

/**
 * Shared base class for test object provider.  Contain code for loader and container creation and loading
 */
export class TestObjectProvider {
    private readonly _loaderContainerTracker = new LoaderContainerTracker();
    private _documentServiceFactory: IDocumentServiceFactory | undefined;
    private _urlResolver: IUrlResolver | undefined;
    private _opProcessingController?: IOpProcessingController;
    private _documentId?: string;

    /**
     * Manage objects for loading and creating container, including the driver, loader, and OpProcessingController
     * @param createFluidEntryPoint - callback to create a fluidEntryPoint, with an optiona; set of channel name
     * and factory for TestFluidObject
     */
    constructor(
        public readonly LoaderConstructor: typeof Loader,
        public readonly driver: ITestDriver,
        private readonly createFluidEntryPoint: (testContainerConfig?: ITestContainerConfig) => fluidEntryPoint,
    ) {

    }

    get documentServiceFactory() {
        if (!this._documentServiceFactory) {
            this._documentServiceFactory = this.driver.createDocumentServiceFactory();
        }
        return this._documentServiceFactory;
    }

    get urlResolver() {
        if (!this._urlResolver) {
            this._urlResolver = this.driver.createUrlResolver();
        }
        return this._urlResolver;
    }

    get documentId() {
        if (this._documentId === undefined) {
            this._documentId = createDocumentId();
        }
        return this._documentId;
    }

    get defaultCodeDetails() {
        return defaultCodeDetails;
    }

    get opProcessingController(): IOpProcessingController {
        if (this._opProcessingController === undefined) {
            this._opProcessingController = new OpProcessingControllerShim(this._loaderContainerTracker);
        }
        return this._opProcessingController;
    }

    /**
     * Create a loader.  Container created/loaded thru this loader will not be automatically added
     * to the OpProcessingController, and will need to be added manually if needed.
     *
     * Only the version of the loader will vary based on compat config. The version of
     * containerRuntime/dataRuntime used in fluidEntryPoint will be used as is from what is passed in.
     *
     * @param packageEntries - list of code details and fluidEntryPoint pairs.
     */
    private createLoader(packageEntries: Iterable<[IFluidCodeDetails, fluidEntryPoint]>) {
        const codeLoader = new LocalCodeLoader(packageEntries);
        const loader = new this.LoaderConstructor({
            urlResolver: this.urlResolver,
            documentServiceFactory: this.documentServiceFactory,
            codeLoader,
            logger: ChildLogger.create(getTestLogger?.(), undefined, { all: { driverType: this.driver.type } }),
        });
        this._loaderContainerTracker.add(loader);
        return loader;
    }

    /**
     * Create a container using a default document id and code details.
     * Container created is automatically added to the OpProcessingController to manage op flow
     *
     * Only the version of the loader will vary based on compat config. The version of
     * containerRuntime/dataRuntime used in fluidEntryPoint will be used as is from what is passed in.
     *
     * @param packageEntries - list of code details and fluidEntryPoint pairs.
     */
    public async createContainer(entryPoint: fluidEntryPoint) {
        const loader = this.createLoader([[defaultCodeDetails, entryPoint]]);
        const container = await createAndAttachContainer(
            defaultCodeDetails,
            loader,
            this.driver.createCreateNewRequest(createDocumentId()),
        );
        this.opProcessingController.addDeltaManagers(container.deltaManager);
        return container;
    }

    /**
     * Make a test loader.  Container created/loaded thru this loader will not be automatically added
     * to the OpProcessingController, and will need to be added manually if needed.
     * The version of the loader/containerRuntime/dataRuntime may vary based on compat config of the current run
     * @param testContainerConfig - optional configuring the test Container
     */
    public makeTestLoader(testContainerConfig?: ITestContainerConfig) {
        return this.createLoader([[defaultCodeDetails, this.createFluidEntryPoint(testContainerConfig)]]);
    }

    /**
     * Make a container using a default document id and code details
     * Container loaded is automatically added to the OpProcessingController to manage op flow
     * @param testContainerConfig - optional configuring the test Container
     */
    public async makeTestContainer(testContainerConfig?: ITestContainerConfig): Promise<IContainer> {
        const loader = this.makeTestLoader(testContainerConfig);
        const container =
            await createAndAttachContainer(
                defaultCodeDetails,
                loader,
                this.driver.createCreateNewRequest(this.documentId));
        this.opProcessingController.addDeltaManagers(container.deltaManager);
        return container;
    }

    /**
     * Load a container using a default document id and code details.
     * Container loaded is automatically added to the OpProcessingController to manage op flow
     * @param testContainerConfig - optional configuring the test Container
     */
    public async loadTestContainer(testContainerConfig?: ITestContainerConfig): Promise<Container> {
        const loader = this.makeTestLoader(testContainerConfig);
        const container = await loader.resolve({ url: await this.driver.createContainerUrl(this.documentId) });
        await waitContainerToCatchUp(container);
        this.opProcessingController.addDeltaManagers(container.deltaManager);
        return container;
    }

    public reset() {
        this._loaderContainerTracker.reset();
        this._documentServiceFactory = undefined;
        this._urlResolver = undefined;
        this._opProcessingController = undefined;
        this._documentId = undefined;
    }

    public async ensureSynchronized() {
        return this._loaderContainerTracker.ensureSynchronized();
    }
}
