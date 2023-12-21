/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Interface to check if a cluster is draining
 * @internal
 */
export interface IClusterDrainingChecker {
	/**
	 * Check if cluster is draining
	 */
	isClusterDraining(): Promise<boolean>;
}

export class DummyClusterDrainingChecker implements IClusterDrainingChecker {
	public async isClusterDraining(): Promise<boolean> {
		console.log("yunho: isClusterDraining called");
		return false;
	}
}
