/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainer } from "@fluidframework/container-definitions";
import { Container, Loader, waitContainerToCatchUp } from "@fluidframework/container-loader";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";
import { ITestDriver } from "@fluidframework/test-driver-definitions";
import { v4 as uuid } from "uuid";
import { LoaderContainerTracker } from "./loaderContainerTracker";
import { fluidEntryPoint, LocalCodeLoader } from "./localCodeLoader";
import { createAndAttachContainer } from "./localLoader";
import { OpProcessingController } from "./opProcessingController";

const defaultCodeDetails: IFluidCodeDetails = {
    package: "defaultTestPackage",
    config: {},
};

export const createDocumentId = (): string => uuid();

/**
 * Shared base class for test object provider.  Contain code for loader and container creation and loading
 */
export class TestObjectProvider<TestContainerConfigType> {
    private readonly _loaderContainerTracker = new LoaderContainerTracker();
    private _documentServiceFactory: IDocumentServiceFactory | undefined;
    private _urlResolver: IUrlResolver | undefined;
    private _opProcessingController?: OpProcessingController;
    private _documentId?: string;

    /**
     * Manage objects for loading and creating container, including the driver, loader, and OpProcessingController
     * @param createFluidEntryPoint - callback to create a fluidEntryPoint, with an optiona; set of channel name
     * and factory for TestFluidObject
     */
    constructor(
        public readonly driver: ITestDriver,
        private readonly createFluidEntryPoint: (testContainerConfig?: TestContainerConfigType) => fluidEntryPoint,
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

    get opProcessingController(): OpProcessingController {
        if (this._opProcessingController === undefined) {
            this._opProcessingController = new OpProcessingController();
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
     * Make a test loader.  Container created/loaded thru this loader will not be automatically added
     * to the OpProcessingController, and will need to be added manually if needed.
     * @param testContainerConfig - optional configuring the test Container
     */
    public makeTestLoader(testContainerConfig?: TestContainerConfigType) {
        const loader = this.createLoader([[defaultCodeDetails, this.createFluidEntryPoint(testContainerConfig)]]);
        this._loaderContainerTracker.add(loader);
        return loader;
    }

    /**
     * Make a container using a default document id and code details
     * Container loaded is automatically added to the OpProcessingController to manage op flow
     * @param testContainerConfig - optional configuring the test Container
     */
    public async makeTestContainer(testContainerConfig?: TestContainerConfigType): Promise<IContainer> {
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
    public async loadTestContainer(testContainerConfig?: TestContainerConfigType): Promise<Container> {
        const loader = this.makeTestLoader(testContainerConfig);
        const container = await loader.resolve({ url: this.driver.createContainerUrl(this.documentId) });
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
}
