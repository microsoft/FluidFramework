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
	 * @param cluster - Optional. Use current cluster name if not provided.
	 */
	isClusterDraining(cluster?: string): Promise<boolean>;
}

/**
 * Retry after time when cluster is under draining
 * @internal
 */
export const clusterDrainingRetryTimeInMs = (10 + 2) * 60 * 1000; // 12 minutes
