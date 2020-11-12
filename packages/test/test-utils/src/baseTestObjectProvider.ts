/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Loader, waitContainerToCatchUp } from "@fluidframework/container-loader";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { IUrlResolver, IDocumentServiceFactory } from "@fluidframework/driver-definitions";
import { fluidEntryPoint, LocalCodeLoader } from "./localCodeLoader";
import { createAndAttachContainer } from "./localLoader";
import { OpProcessingController } from "./opProcessingController";

const defaultCodeDetails: IFluidCodeDetails = {
    package: "defaultTestPackage",
    config: {},
};

export abstract class TestObjectProviderCommon<TestContainerConfigType> {
    /**
     * Create a set of object to
     * @param createFluidEntryPoint - callback to create a fluidEntryPoint, with an optiona; set of channel name
     * and factory for TestFluidObject
     * @param serviceConfiguration - optional serviceConfiguration to create the LocalDeltaConnectionServer with
     * @param _deltaConnectionServer - optional deltaConnectionServer to share documents between different provider
     */
    constructor(
        private readonly createFluidEntryPoint: (testContainerConfig?: TestContainerConfigType) => fluidEntryPoint,
    ) {

    }

    get defaultCodeDetails() {
        return defaultCodeDetails;
    }

    abstract get documentServiceFactory(): IDocumentServiceFactory;
    abstract get urlResolver(): IUrlResolver;
    abstract get opProcessingController(): OpProcessingController;

    protected abstract get documentId(): string;
    protected abstract get documentLoadUrl(): string;

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
        return this.createLoader([[defaultCodeDetails, this.createFluidEntryPoint(testContainerConfig)]]);
    }

    /**
     * Make a container using a default document id and code details
     * Container loaded is automatically added to the OpProcessingController to manage op flow
     * @param testContainerConfig - optional configuring the test Container
     */
    public async makeTestContainer(testContainerConfig?: TestContainerConfigType) {
        const loader = this.makeTestLoader(testContainerConfig);
        const container =
            await createAndAttachContainer(this.documentId, defaultCodeDetails, loader, this.urlResolver);
        this.opProcessingController.addDeltaManagers(container.deltaManager);
        return container;
    }

    /**
     * Load a container using a default document id and code details.
     * Container loaded is automatically added to the OpProcessingController to manage op flow
     * @param testContainerConfig - optional configuring the test Container
     */
    public async loadTestContainer(testContainerConfig?: TestContainerConfigType) {
        const loader = this.makeTestLoader(testContainerConfig);
        const container = await loader.resolve({ url: this.documentLoadUrl });
        await waitContainerToCatchUp(container);
        this.opProcessingController.addDeltaManagers(container.deltaManager);
        return container;
    }
}
