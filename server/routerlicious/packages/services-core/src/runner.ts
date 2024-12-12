/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type nconf from "nconf";
import { ILogger } from "./lambdas";

/**
 * A runner represents a task that starts once start is called. And ends when either start completes
 * or stop is called.
 * @internal
 */
export interface IRunner {
	/**
	 * Starts the runner
	 */
	start(logger: ILogger | undefined): Promise<void>;

	/**
	 * Stops the runner
	 */
	stop(caller?: string, uncaughtException?: any): Promise<void>;

	/**
	 * Pauses the runner
	 */
	pause?(partitionId: number, offset: number): Promise<void>;

	/**
	 * Resumes the runner
	 */
	resume?(partitionId: number): Promise<void>;
}

/**
 * Base interfaces for resources that can be provided to a runner
 * @internal
 */
export interface IResources {
	/**
	 * Disposes fo the resources
	 */
	dispose(): Promise<void>;
}

/**
 * A resource factory is used to create the resources needed by a runner
 * @internal
 */
export interface IResourcesFactory<T extends IResources> {
	/**
	 * Creates a new set of resources
	 */
	create(config: nconf.Provider, customizations?: Record<string, any>): Promise<T>;

	/**
	 * Create a new set of customizations for resource factory to provide overrides.
	 */
	customize?(config: nconf.Provider): Promise<Record<string, any>>;
}

/**
 * A runner factory is used to create new runners
 * @internal
 */
export interface IRunnerFactory<T> {
	/**
	 * Creates a new runner
	 */
	create(resources: T): Promise<IRunner>;
}
