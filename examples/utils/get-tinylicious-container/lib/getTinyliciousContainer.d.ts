/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IContainer, IRuntimeFactory } from "@fluidframework/container-definitions";
/**
 * Connect to the Tinylicious service and retrieve a Container with the given ID running the given code.
 * @param documentId - The document id to retrieve or create
 * @param containerRuntimeFactory - The container factory to be loaded in the container
 */
export declare function getTinyliciousContainer(documentId: string, containerRuntimeFactory: IRuntimeFactory, createNew: boolean): Promise<IContainer>;
//# sourceMappingURL=getTinyliciousContainer.d.ts.map