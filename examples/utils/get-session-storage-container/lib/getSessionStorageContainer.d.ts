/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IRuntimeFactory } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
/**
 * Connect to the local SessionStorage Fluid service and retrieve a Container with the given ID running the given code.
 * @param documentId - The document id to retrieve or create
 * @param containerRuntimeFactory - The container factory to be loaded in the container
 */
export declare function getSessionStorageContainer(documentId: string, containerRuntimeFactory: IRuntimeFactory, createNew: boolean): Promise<Container>;
//# sourceMappingURL=getSessionStorageContainer.d.ts.map