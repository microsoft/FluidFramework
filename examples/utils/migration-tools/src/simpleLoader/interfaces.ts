/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainer } from "@fluidframework/container-definitions/internal";

/**
 * @alpha
 */
export interface ISimpleLoader {
	/**
	 * Check if the ISimpleLoader knows how to instantiate the provided container code version.
	 * It is async to permit dynamic code loading - e.g. referring to a remote service to determine if the requested
	 * version is available.
	 * @param version - the container code version to check
	 */
	supportsVersion(version: string): Promise<boolean>;

	/**
	 * Create a detached container using the specified version of container code.
	 * Returns an object containing the detached container plus an attach callback.  When invoked, the attach callback
	 * returns a promise that will resolve after attach has completed with the id of the container.
	 * @param version - the container code version to create a container for
	 */
	createDetached(
		version: string,
	): Promise<{ container: IContainer; attach: () => Promise<string> }>;

	/**
	 * Load the container with the given id.
	 * @param id - the id of the container to load
	 */
	loadExisting(id: string): Promise<IContainer>;
}
