/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentServiceFactory } from "@fluidframework/driver-definitions";
import { LocalDocumentServiceFactory, LocalResolver } from "@fluidframework/local-driver";
import { IServiceConfiguration } from "@fluidframework/protocol-definitions";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { BaseTestObjectProvider } from "./baseTestObjectProvider";
import { fluidEntryPoint } from "./localCodeLoader";
import { OpProcessingController } from "./opProcessingController";

const defaultDocumentId = "defaultDocumentId";

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
 *   IServiceConfiguration
 *   ILocalDeltaConnectionServer
 */
export class LocalTestObjectProvider<TestContainerConfigType>
    extends BaseTestObjectProvider<TestContainerConfigType> {
    private _documentServiceFactory: IDocumentServiceFactory | undefined;
    private _defaultUrlResolver: LocalResolver | undefined;
    private _opProcessingController: OpProcessingController | undefined;

    /**
     * Create a set of object to
     * @param createFluidEntryPoint - callback to create a fluidEntryPoint, with an optiona; set of channel name
     * and factory for TestFluidObject
     * @param serviceConfiguration - optional serviceConfiguration to create the LocalDeltaConnectionServer with
     * @param _deltaConnectionServer - optional deltaConnectionServer to share documents between different provider
     */
    constructor(
        createFluidEntryPoint: (testContainerConfig?: TestContainerConfigType) => fluidEntryPoint,
        private readonly serviceConfiguration?: Partial<IServiceConfiguration>,
        private _deltaConnectionServer?: ILocalDeltaConnectionServer | undefined,
    ) {
        super(createFluidEntryPoint);
    }

    get deltaConnectionServer() {
        if (!this._deltaConnectionServer) {
            this._deltaConnectionServer = LocalDeltaConnectionServer.create(undefined, this.serviceConfiguration);
        }
        return this._deltaConnectionServer;
    }

    get documentServiceFactory() {
        if (!this._documentServiceFactory) {
            this._documentServiceFactory = new LocalDocumentServiceFactory(this.deltaConnectionServer);
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
            this._opProcessingController = new OpProcessingController(this.deltaConnectionServer);
        }
        return this._opProcessingController;
    }

    get documentId() {
        return defaultDocumentId;
    }

    get documentLoadUrl() {
        return `fluid-test://localhost/${this.documentId}`;
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
    }
}
