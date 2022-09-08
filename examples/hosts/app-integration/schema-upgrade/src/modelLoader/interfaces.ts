/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainer } from "@fluidframework/container-definitions";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions";

export interface IModelLoader<ModelType> {
    /**
     * Check if the IModelLoader knows how to instantiate an appropriate model for the provided container code version.
     * It is async to permit dynamic model loading - e.g. referring to a remote service to determine if the requested
     * model is available.
     * @param version - the container code version to check
     */
    supportsVersion(version: string): Promise<boolean>;

    /**
     * Create a detached model using the specified version of container code.
     * Returns an object containing the detached model plus an attach callback.  When invoked, the attach callback
     * returns a promise that will resolve after attach has completed with the id of the container.
     * @param version - the container code version to create a model for
     */
    createDetached(version: string): Promise<{ model: ModelType; attach: () => Promise<string>; }>;

    /**
     * Load a model for the container with the given id.
     * @param id - the id of the container to load
     */
    loadExisting(id: string): Promise<ModelType>;
}

/**
 * The callback signature that the container author will provide.  It must return a promise for the container's model.
 */
 export type ModelMakerCallback<ModelType> = (runtime: IContainerRuntime, container: IContainer) => Promise<ModelType>;
