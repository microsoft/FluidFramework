/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-extraneous-dependencies */
export {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
export { SharedCell } from "@fluidframework/cell";
export * from "@fluidframework/container-definitions";
export { Container, Loader } from "@fluidframework/container-loader";
export { ContainerRuntime, IContainerRuntimeOptions } from "@fluidframework/container-runtime";
export * from "@fluidframework/core-interfaces";
export { SharedCounter } from "@fluidframework/counter";
export { IChannelFactory } from "@fluidframework/datastore-definitions";
export { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";
export { Ink } from "@fluidframework/ink";
export { LocalDocumentServiceFactory, LocalResolver } from "@fluidframework/local-driver";
export { SharedDirectory, SharedMap } from "@fluidframework/map";
export { SharedMatrix } from "@fluidframework/matrix";
export { ConsensusQueue } from "@fluidframework/ordered-collection";
export { IClientConfiguration } from "@fluidframework/protocol-definitions";
export { ConsensusRegisterCollection } from "@fluidframework/register-collection";
export { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
export { SharedString, SparseMatrix } from "@fluidframework/sequence";
export { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
export { ITestDriver } from "@fluidframework/test-driver-definitions";
export {
    createLocalLoader,
    createAndAttachContainer,
    ChannelFactoryRegistry,
    LocalCodeLoader,
    OpProcessingController,
    TestContainerRuntimeFactory,
    TestFluidObjectFactory,
    TestObjectProvider,
} from "@fluidframework/test-utils";
/* eslint-enable import/no-extraneous-dependencies */
