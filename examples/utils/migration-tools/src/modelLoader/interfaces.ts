/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IMigrationTool } from "../interfaces/index.js";

// TODO: Consider just extending IAttachedMigratableModel
/**
 * Object returned from calling IModelLoader.createDetached().
 * @alpha
 */
export interface IDetachedMigratableModel<ModelType> {
	/**
	 * The newly created, detached model object.
	 */
	model: ModelType;
	/**
	 * The migration tool that will be used to migrate away from this model.
	 */
	migrationTool: IMigrationTool;
	/**
	 * A function that will attach the model object to the service when called.
	 * @returns a Promise that will resolve after attach completes with the container ID of the newly attached
	 * container.
	 */
	attach: () => Promise<string>;
}

/**
 * Object returned from calling IModelLoader.createDetached().
 * @alpha
 */
export interface IAttachedMigratableModel<ModelType> {
	/**
	 * The newly created, detached model object.
	 */
	model: ModelType;
	/**
	 * The migration tool that will be used to migrate away from this model.
	 */
	migrationTool: IMigrationTool;
}

/**
 * @alpha
 */
export interface IMigratableModelLoader<ModelType> {
	/**
	 * Check if the IMigratableModelLoader knows how to instantiate an appropriate model for the provided container code version.
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
	createDetached(version: string): Promise<IDetachedMigratableModel<ModelType>>;

	/**
	 * Load a model for the container with the given id.
	 * @param id - the id of the container to load
	 */
	loadExisting(id: string): Promise<IAttachedMigratableModel<ModelType>>;

	/**
	 * Load a model for the container with the given id.
	 * @param id - the id of the container to load
	 * @param sequenceNumber - the sequence number we want to load to and pause at
	 */
	loadExistingPaused(
		id: string,
		sequenceNumber: number,
	): Promise<IAttachedMigratableModel<ModelType>>;
}
