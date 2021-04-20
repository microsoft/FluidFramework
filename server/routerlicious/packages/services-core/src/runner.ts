/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type nconf from "nconf";
import { ILogger } from "./lambdas";

/**
 * A runner represents a task that starts once start is called. And ends when either start completes
 * or stop is called.
 */
export interface IRunner {
    /**
     * Starts the runner
     */
    start(logger: ILogger | undefined): Promise<void>;

    /**
     * Stops the runner
     */
    stop(): Promise<void>;
}

/**
 * Base interfaces for resources that can be provided to a runner
 */
export interface IResources {
    /**
     * Disposes fo the resources
     */
    dispose(): Promise<void>;
}

/**
 * A resource factory is used to create the resources needed by a runner
 */
export interface IResourcesFactory<T extends IResources> {
    /**
     * Creates a new set of resources
     */
    create(config: nconf.Provider): Promise<T>;
}

/**
 * A runner factory is used to create new runners
 */
export interface IRunnerFactory<T> {
    /**
     * Creates a new runner
     */
    create(resources: T): Promise<IRunner>;
}
