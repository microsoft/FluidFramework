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
export * from "@fluidframework/container-definitions";
export * from "@fluidframework/core-interfaces";
export { Container, Loader } from "@fluidframework/container-loader";
export { ContainerRuntime, IContainerRuntimeOptions } from "@fluidframework/container-runtime";
export { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";
export { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
export { IChannelFactory } from "@fluidframework/datastore-definitions";
export {
    createLocalLoader,
    createAndAttachContainer,
    TestFluidObjectFactory,
    TestContainerRuntimeFactory,
    LocalCodeLoader,
    LocalTestObjectProvider,
    ChannelFactoryRegistry,
    OpProcessingController,
} from "@fluidframework/test-utils";
export { SharedDirectory, SharedMap } from "@fluidframework/map";
export { SharedString, SparseMatrix } from "@fluidframework/sequence";
export { LocalDocumentServiceFactory, LocalResolver } from "@fluidframework/local-driver";
export { ConsensusRegisterCollection } from "@fluidframework/register-collection";
export { SharedCell } from "@fluidframework/cell";
export { SharedCounter } from "@fluidframework/counter";
export { Ink } from "@fluidframework/ink";
export { SharedMatrix } from "@fluidframework/matrix";
export { ConsensusQueue } from "@fluidframework/ordered-collection";
export { IClientConfiguration } from "@fluidframework/protocol-definitions";
export { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
/* eslint-enable import/no-extraneous-dependencies */
